import NetInfo from '@react-native-community/netinfo';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';
import { SupabaseUserRepository } from './supabaseUserRepository';
import { SQLiteUserRepository } from '../sqlite/SQLiteUserRepository';

export class HybridUserRepository implements IUserRepository {
  private static instance: HybridUserRepository;
  private onlineRepo: IUserRepository;
  private offlineRepo: IUserRepository;

  private constructor() {
    this.onlineRepo = SupabaseUserRepository.getInstance();
    this.offlineRepo = SQLiteUserRepository.getInstance();
  }

  public static getInstance(): HybridUserRepository {
    if (!HybridUserRepository.instance) {
      HybridUserRepository.instance = new HybridUserRepository();
    }
    return HybridUserRepository.instance;
  }

  private async isOnline(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
  }

  async register(user: User): Promise<User> {
    if (await this.isOnline()) {
      try {
        const remoteUser = await this.onlineRepo.register(user);
        // Also save to local db for offline access if offline repo supports register
        try {
          // some offline repos implement register
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await this.offlineRepo.register(remoteUser);
        } catch (err) {
          // ignore if offline repo doesn't implement register
        }
        return remoteUser;
      } catch (error) {
        console.warn('Online registration failed, falling back to offline.', error);
        // attempt offline register
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return this.offlineRepo.register(user);
      }
    }
    // offline
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return this.offlineRepo.register(user);
  }

  async authenticate(email: string, password: string): Promise<User> {
    if (await this.isOnline()) {
      try {
        const user = await this.onlineRepo.authenticate(email, password);
        // Try to sync user data to local db after successful login if supported
        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await this.offlineRepo.update(user);
        } catch (err) {
          // ignore if offline repo doesn't implement update
        }
        return user;
      } catch (error) {
        console.warn('Online authentication failed, trying offline.', error);
        return this.offlineRepo.authenticate(email, password);
      }
    }
    return this.offlineRepo.authenticate(email, password);
  }

  async findByEmail(email: string): Promise<User | null> {
    if (await this.isOnline()) {
      return this.onlineRepo.findByEmail(email);
    }
    return this.offlineRepo.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    if (await this.isOnline()) {
      return this.onlineRepo.findById(id);
    }
    return this.offlineRepo.findById(id);
  }

  async update(user: User): Promise<void> {
    // Update is not part of IUserRepository interface; attempt best-effort if implementations provide it
    try {
      if (await this.isOnline()) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await this.onlineRepo.update(user);
      }
    } catch (err) {
      // ignore
    }
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await this.offlineRepo.update(user);
    } catch (err) {
      // ignore
    }
  }

  async insertOrUpdate(user: User): Promise<void> {
    // InsertOrUpdate is not part of IUserRepository interface; attempt best-effort if implementations provide it
    try {
      if (await this.isOnline()) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        if (this.onlineRepo.insertOrUpdate) {
          await this.onlineRepo.insertOrUpdate(user);
        }
      }
    } catch (err) {
      // ignore
    }
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (this.offlineRepo.insertOrUpdate) {
        await this.offlineRepo.insertOrUpdate(user);
      }
    } catch (err) {
      // ignore
    }
  }

  async delete(id: string): Promise<void> {
    // Delete is not part of IUserRepository interface; attempt if available
    try {
      if (await this.isOnline()) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await this.onlineRepo.delete(id);
      }
    } catch (err) {
      // ignore
    }
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await this.offlineRepo.delete(id);
    } catch (err) {
      // ignore
    }
  }
  
  async findAll(): Promise<User[]> {
    // findAll is not defined in IUserRepository interface; try to call if available
    try {
      if (await this.isOnline()) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return await this.onlineRepo.findAll();
      }
    } catch (err) {
      // ignore
    }
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return await this.offlineRepo.findAll();
    } catch (err) {
      return [];
    }
  }
}