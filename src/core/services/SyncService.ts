import NetInfo from '@react-native-community/netinfo';
import DatabaseConnection from '../infra/sqlite/connection';
import { SupabaseUserRepository } from '../infra/repositories/supabaseUserRepository';
import { SupabaseTravelRepository } from '../infra/repositories/supabaseTravelRepository';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { ITravelRepository } from '../domain/repositories/ITravelRepository';
import { User } from '../domain/entities/User';
import { Travel } from '../domain/entities/Travel';
import { Name } from '../domain/value-objects/Name';
import { Email } from '../domain/value-objects/Email';
import { Password } from '../domain/value-objects/Password';
import { GeoCoordinates } from '../domain/value-objects/GeoCoordinates';
import { Photo } from '../domain/value-objects/Photo';
import { makeTravelUseCases } from '../factories/makeTraveUsecases'
export class SyncService {
  private static instance: SyncService;
  private isSyncing: boolean = false;
  private userRepository: IUserRepository;
  private travelRepository: ITravelRepository;

  private constructor(
    userRepository: IUserRepository,
    travelRepository: ITravelRepository
  ) {
    this.userRepository = userRepository;
    this.travelRepository = travelRepository;
    NetInfo.addEventListener(state => {
      if (state.isConnected && !this.isSyncing) {
        this.syncAllPendingChanges();
      }
    });
  }

  public static getInstance(
    userRepository: IUserRepository = SupabaseUserRepository.getInstance(),
    travelRepository: ITravelRepository = SupabaseTravelRepository.getInstance()
  ): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService(userRepository, travelRepository);
    }
    return SyncService.instance;
  }

  private async syncAllPendingChanges() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    console.log('Starting sync...');

    try {
      await this.syncUsers();
      await this.syncTravels();
      await this.processSyncLog();
      console.log('Sync finished successfully.');
    } catch (error) {
      console.error('Error during sync:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncUsers() {
    console.log('Syncing users...');
    try {
      const pendingUsers = await this.getLocalPendingUsers();
      
      for (const userRow of pendingUsers) {
        const user = User.create(
          userRow.id,
          Name.create(userRow.name),
          Email.create(userRow.email),
          Password.create(userRow.password_hash),
          GeoCoordinates.create(userRow.latitude, userRow.longitude)
        );

        try {
          if (userRow.sync_status === 'pending_create') {
            await this.userRepository.register(user);
          } else if (userRow.sync_status === 'pending_update') {
            // Update method can be added if needed
          }
          const db = await DatabaseConnection.getConnection();
          await db.runAsync("UPDATE users SET sync_status = 'synced' WHERE id = ?", user.id);
        } catch (error) {
          console.error(`Failed to sync user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error syncing users:', error);
    }
  }

  private async syncTravels() {
    console.log('Syncing travels...');
    try {
      // Fetch pending travels from local DB
      const pendingRecords = await this.getLocalPendingTravels();

      for (const recordRow of pendingRecords) {
        let photoUrl = recordRow.photo_url;

        try {
          if (photoUrl?.startsWith('file://')) {
            console.log(`Uploading local image: ${photoUrl}`);
            const travelUseCases = makeTravelUseCases();
            const uploadedPhotoUrl = await travelUseCases.uploadFile?.execute({
              imageAsset: photoUrl,
              bucket: 'upload',
              userId: recordRow.user_id,
            });
            console.log(`Image uploaded. Remote URL: ${uploadedPhotoUrl}`);
            photoUrl = uploadedPhotoUrl;
          }

          if (!photoUrl) {
            throw new Error("Photo URL became null or undefined after upload attempt.");
          }

          const travel = Travel.create(
            recordRow.id,
            recordRow.title,
            recordRow.description,
            new Date(recordRow.date),
            { 
              id: recordRow.user_id,
              name: { value: recordRow.user_name || 'Usuário desconhecido' },
              email: recordRow.user_email || ''
            } as Partial<User>,
            GeoCoordinates.create(recordRow.latitude, recordRow.longitude),
            photoUrl ? Photo.create(photoUrl) : undefined
          );

          if (recordRow.sync_status === 'pending_create') {
            await this.travelRepository.save(travel);
          } else if (recordRow.sync_status === 'pending_update') {
            await this.travelRepository.update(travel);
          }

          // Update local DB with synced status and photo URL
          const db = await DatabaseConnection.getConnection();
          await db.runAsync(
            "UPDATE travels SET sync_status = 'synced', photo_url = ? WHERE id = ?",
            photoUrl,
            recordRow.id
          );
        } catch (error) {
          console.error(`Failed to sync travel ${recordRow.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error syncing travels:', error);
    }
  }

  private async processSyncLog() {
    console.log('Processing sync log...');
    try {
      // Fetch delete actions from local sync_log
      const logEntries = await this.getLocalSyncLog();

      for (const logEntry of logEntries) {
        try {
          if (logEntry.entity_type === 'travel') {
            await this.travelRepository.delete(logEntry.entity_id);
          }
          const db = await DatabaseConnection.getConnection();
          await db.runAsync("DELETE FROM sync_log WHERE id = ?", logEntry.id);
        } catch (error) {
          console.log(logEntry,"aqui")
          console.error(`Failed to process sync_log entry ${logEntry.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing sync log:', error);
    }
  }

  public async fetchAndSyncRemoteData() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    console.log('Fetching remote data and syncing local DB...');

    try {
      const remoteTravels = await this.travelRepository.findAll();
      await this.updateLocalTravels(remoteTravels);

      console.log('Remote data sync finished successfully.');
    } catch (error) {
      console.error('Error during remote data sync:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private async updateLocalTravels(remoteTravels: Travel[]) {
    const db = await DatabaseConnection.getConnection();
    for (const travel of remoteTravels) {
      await db.runAsync(
        'INSERT OR REPLACE INTO travels (id, title, description, date, user_id, latitude, longitude, photo_url, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        travel.id,
        travel.title,
        travel.description,
        travel.date.toISOString(),
        travel.user?.id || '',
        travel.location?.latitude || 0,
        travel.location?.longitude || 0,
        travel.photo?.url || '',
        'synced'
      );
    }
  }

  // Helper method to check sync status
  public isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  // Helper methods for local database operations
  private async getLocalPendingUsers() {
    const db = await DatabaseConnection.getConnection();
    return await db.getAllAsync<any>("SELECT * FROM users WHERE sync_status != 'synced'");
  }

  private async getLocalPendingTravels() {
    const db = await DatabaseConnection.getConnection();
    return await db.getAllAsync<any>("SELECT t.*, u.name as user_name, u.email as user_email FROM travels t LEFT JOIN users u ON t.user_id = u.id WHERE t.sync_status != 'synced'");
  }

  private async getLocalSyncLog() {
    const db = await DatabaseConnection.getConnection();
    return await db.getAllAsync<any>("SELECT * FROM sync_log WHERE action = 'delete'");
  }
}
