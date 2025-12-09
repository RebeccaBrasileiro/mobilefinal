import DatabaseConnection from './connection';
import { ITravelRepository } from '../../domain/repositories/ITravelRepository';
import { Travel } from '../../domain/entities/Travel';
import { Name } from '../../domain/value-objects/Name';
import { Photo } from '../../domain/value-objects/Photo';
import { GeoCoordinates } from '../../domain/value-objects/GeoCoordinates';
import { User } from '../../domain/entities/User';
import { v4 as uuid } from 'uuid';

export class SQLiteTravelRepository implements ITravelRepository {
  private static instance: SQLiteTravelRepository;

  private constructor() { }

  public static getInstance(): SQLiteTravelRepository {
    if (!SQLiteTravelRepository.instance) {
      SQLiteTravelRepository.instance = new SQLiteTravelRepository();
    }
    return SQLiteTravelRepository.instance;
  }

  async save(travel: Travel): Promise<void> {
    const db = await DatabaseConnection.getConnection();

    await db.runAsync(
      'INSERT INTO travels (id, title, description, date, user_id, latitude, longitude, photo_url, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      travel.id,
      travel.title,
      travel.description,
      travel.date.toISOString(),
      travel.user?.id || '',
      travel.location?.latitude || 0,
      travel.location?.longitude || 0,
      travel.photo?.url || '',
      'pending_create'
    );
  }

  async findById(id: string): Promise<Travel | null> {
    const db = await DatabaseConnection.getConnection();
    const travelRow = await db.getFirstAsync<any>(
      'SELECT t.*, u.name as user_name, u.email as user_email FROM travels t LEFT JOIN users u ON t.user_id = u.id WHERE t.id = ?',
      id
    );

    if (travelRow) {
      return this.mapRowToTravel(travelRow);
    }
    return null;
  }

  async findAll(): Promise<Travel[]> {
    const db = await DatabaseConnection.getConnection();
    const travelRows = await db.getAllAsync<any>(
      'SELECT t.*, u.name as user_name, u.email as user_email FROM travels t LEFT JOIN users u ON t.user_id = u.id'
    );
    return travelRows.map(travelRow => this.mapRowToTravel(travelRow));
  }

  async findByUserId(userId: string): Promise<Travel[]> {
    const db = await DatabaseConnection.getConnection();
    console.log(`[SQLiteTravelRepository] Finding travels for user: ${userId}`);
    const travelRows = await db.getAllAsync<any>(
      'SELECT t.*, u.name as user_name, u.email as user_email FROM travels t LEFT JOIN users u ON t.user_id = u.id WHERE t.user_id = ?',
      userId
    );
    console.log(`[SQLiteTravelRepository] Found ${travelRows.length} travels`);
    travelRows.forEach(row => {
      console.log(`  - Travel: ${row.id}, UserID: ${row.user_id}, UserName: ${row.user_name}`);
    });
    return travelRows.map(travelRow => this.mapRowToTravel(travelRow));
  }

  async update(travel: Travel): Promise<void> {
    const db = await DatabaseConnection.getConnection();

    await db.runAsync(
      "UPDATE travels SET title = ?, description = ?, date = ?, latitude = ?, longitude = ?, photo_url = ?, sync_status = CASE WHEN sync_status = 'synced' THEN 'pending_update' ELSE sync_status END WHERE id = ?",
      travel.title,
      travel.description,
      travel.date.toISOString(),
      travel.location?.latitude || 0,
      travel.location?.longitude || 0,
      travel.photo?.url || '',
      travel.id
    );
  }

  async delete(id: string): Promise<void> {
    const db = await DatabaseConnection.getConnection();
    await db.runAsync("INSERT INTO sync_log (entity_type, entity_id, action) VALUES ('travel', ?, 'delete')", id);
    await db.runAsync('DELETE FROM travels WHERE id = ?', id);
  }

  private mapRowToTravel(row: any): Travel {
    const userName = row.user_name ? String(row.user_name).trim() : 'Usuário desconhecido';
    console.log(`[Travel] ID: ${row.id}, UserID: ${row.user_id}, UserName: ${userName}`);
    
    return Travel.create(
      row.id,
      row.title,
      row.description,
      new Date(row.date),
      {
        id: row.user_id || '',
        name: { value: userName },
        email: row.user_email || '',
      } as Partial<User>,
      row.latitude && row.longitude ? GeoCoordinates.create(row.latitude, row.longitude) : undefined,
      row.photo_url ? Photo.create(row.photo_url) : undefined
    );
  }
}
