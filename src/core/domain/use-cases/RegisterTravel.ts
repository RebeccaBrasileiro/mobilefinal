import { Travel } from "../entities/Travel";
import { ITravelRepository } from "../repositories/ITravelRepository";
import { GeoCoordinates } from "../value-objects/GeoCoordinates";
import { User } from "../entities/User";
import { Photo } from "../value-objects/Photo";
import { v4 as uuid } from 'uuid';
import DatabaseConnection from "../../infra/sqlite/connection";

export class RegisterTravel {
  constructor(
    private readonly travelRepository: ITravelRepository
  ) {}

  async execute(params: {
    title: string;
    description: string;
    date: Date;
    latitude: number;
    longitude: number;
    user: User;
    photoUrl?: string;
  }): Promise<Travel> {
    const { title, description, date, latitude, longitude, user, photoUrl } = params;

    // Ensure user exists in the LOCAL SQLite database BEFORE creating the travel
    try {
      console.log(`[RegisterTravel] Ensuring user exists in SQLite: ${user.id}`);
      const db = await DatabaseConnection.getConnection();
      
      // Check if user exists
      const existingUser = await db.getFirstAsync<any>(
        'SELECT id FROM users WHERE id = ?',
        user.id
      );
      
      if (!existingUser) {
        console.log(`[RegisterTravel] User does not exist, inserting: ${user.name.value}`);
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
        console.log(`[RegisterTravel] User inserted successfully in SQLite`);
      } else {
        console.log(`[RegisterTravel] User already exists in SQLite`);
      }
    } catch (error) {
      console.error('[RegisterTravel] Error ensuring user in SQLite:', error);
      // Continue anyway, the travel will still be created
    }

    const location = GeoCoordinates.create(latitude, longitude);
    const photo = photoUrl ? Photo.create(photoUrl) : undefined;

    const travel = Travel.create(
      uuid(),
      title,
      description,
      date,
      user,
      location,
      photo
    );

    await this.travelRepository.save(travel);

    return travel;
  }
}
