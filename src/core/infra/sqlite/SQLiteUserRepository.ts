import DatabaseConnection from './connection';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';
import { Name } from '../../domain/value-objects/Name';
import { Email } from '../../domain/value-objects/Email';
import { Password } from '../../domain/value-objects/Password';
import { GeoCoordinates } from '../../domain/value-objects/GeoCoordinates';
import { v4 as uuid } from 'uuid';

export class SQLiteUserRepository implements IUserRepository {
  private static instance: SQLiteUserRepository;

  private constructor() {}

  public static getInstance(): SQLiteUserRepository {
    if (!SQLiteUserRepository.instance) {
      SQLiteUserRepository.instance = new SQLiteUserRepository();
    }
    return SQLiteUserRepository.instance;
  }

  async register(user: User): Promise<User> {
    const db = await DatabaseConnection.getConnection();
    const id = uuid();
    const hashedPassword = `hashed_${user.password.value}`; // Mock hashing
    
    await db.runAsync(
      'INSERT INTO users (id, name, email, password_hash, latitude, longitude, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, user.name.value, user.email.value, hashedPassword, user.location.latitude, user.location.longitude, 'pending_create'
    );

    const newUser = User.create(id, user.name, user.email, Password.create(hashedPassword), user.location);
    return newUser;
  }

  async authenticate(email: string, password: string): Promise<User> {
    const db = await DatabaseConnection.getConnection();
    const userRow = await db.getFirstAsync<any>(
      'SELECT * FROM users WHERE email = ?',
      email
    );

    if (userRow) {
      const isPasswordValid = `hashed_${password}` === userRow.password_hash;
      if (isPasswordValid) {
        return User.create(
          userRow.id,
          Name.create(userRow.name),
          Email.create(userRow.email),
          Password.create(userRow.password_hash),
          GeoCoordinates.create(userRow.latitude, userRow.longitude)
        );
      } else {
        throw new Error('Invalid credentials');
      }
    } else {
      throw new Error('Invalid credentials');
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const db = await DatabaseConnection.getConnection();
    const userRow = await db.getFirstAsync<any>(
      'SELECT * FROM users WHERE email = ?',
      email
    );

    if (userRow) {
      return User.create(
        userRow.id,
        Name.create(userRow.name),
        Email.create(userRow.email),
        Password.create(userRow.password_hash),
        GeoCoordinates.create(userRow.latitude, userRow.longitude)
      );
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    const db = await DatabaseConnection.getConnection();
    const userRow = await db.getFirstAsync<any>(
      'SELECT * FROM users WHERE id = ?',
      id
    );

    if (userRow) {
      return User.create(
        userRow.id,
        Name.create(userRow.name),
        Email.create(userRow.email),
        Password.create(userRow.password_hash),
        GeoCoordinates.create(userRow.latitude, userRow.longitude)
      );
    }
    return null;
  }

  async update(user: User): Promise<void> {
    const db = await DatabaseConnection.getConnection();
    await db.runAsync(
      "UPDATE users SET name = ?, email = ?, latitude = ?, longitude = ?, sync_status = CASE WHEN sync_status = 'synced' THEN 'pending_update' ELSE sync_status END WHERE id = ?",
      user.name.value, user.email.value, user.location.latitude, user.location.longitude, user.id
    );
  }

  async insertOrUpdate(user: User): Promise<void> {
    console.log(`[SQLiteUserRepository] insertOrUpdate called for user: ${user.id}`);
    const db = await DatabaseConnection.getConnection();
    const existingUser = await this.findById(user.id);
    
    if (existingUser) {
      console.log(`[SQLiteUserRepository] User exists, updating: ${user.id}`);
      // User exists, update it
      await this.update(user);
    } else {
      console.log(`[SQLiteUserRepository] User does not exist, inserting: ${user.id} - ${user.name.value}`);
      // User doesn't exist, insert it
      const hashedPassword = `hashed_${user.password.value}`;
      await db.runAsync(
        'INSERT INTO users (id, name, email, password_hash, latitude, longitude, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        user.id,
        user.name.value,
        user.email.value,
        hashedPassword,
        user.location.latitude,
        user.location.longitude,
        'pending_create'
      );
      console.log(`[SQLiteUserRepository] User inserted successfully`);
    }
  }

  async delete(id: string): Promise<void> {
    const db = await DatabaseConnection.getConnection();
    await db.runAsync("INSERT INTO sync_log (entity_type, entity_id, action) VALUES ('user', ?, 'delete')", id);
    await db.runAsync('DELETE FROM users WHERE id = ?', id);
  }

  async findAll(): Promise<User[]> {
    const db = await DatabaseConnection.getConnection();
    const userRows = await db.getAllAsync<any>('SELECT * FROM users');
    return userRows.map(userRow => 
      User.create(
        userRow.id,
        Name.create(userRow.name),
        Email.create(userRow.email),
        Password.create(userRow.password_hash),
        GeoCoordinates.create(userRow.latitude, userRow.longitude)
      )
    );
  }
}
