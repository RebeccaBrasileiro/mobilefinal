import { Travel } from "../entities/Travel";
import { ITravelRepository } from "../repositories/ITravelRepository";

export class FindTravelByUserId {
  constructor(private readonly travelRepository: ITravelRepository) {}

  async execute(userId: string): Promise<Travel[]> {
    return this.travelRepository.findByUserId(userId);
  }
}
