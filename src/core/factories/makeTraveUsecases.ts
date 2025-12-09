
import { ITravelRepository } from '../domain/repositories/ITravelRepository';
import { DeleteTravel } from '../domain/use-cases/DeleteTravel';
import { FindTravel } from '../domain/use-cases/FindTravel';
import { RegisterTravel } from '../domain/use-cases/RegisterTravel';
import { UpdateTravel } from '../domain/use-cases/UpdateTravel';
import { MockTravelRepository } from '../infra/repositories/MockTravelRepository';
import { FindAllTravel } from '../domain/use-cases/FindAllTravel';
import { FindTravelByUserId } from '../domain/use-cases/FindTravelByUserId';
import { SupabaseTravelRepository } from '../infra/repositories/supabaseTravelRepository';

import {UploadFileUseCase} from "../domain/use-cases/UploadFile"
import {DeleteFileUseCase} from "../domain/use-cases/DeleteFile"
import {SupabaseStorageService} from "../infra/supabase/storage/storageService"
import { HybridTravelRepository } from '../infra/repositories/HybridTravelRepository';

export function makeTravelUseCases() {
  const travelRepository: ITravelRepository = process.env.EXPO_PUBLIC_USE_API
     ? HybridTravelRepository.getInstance()
    : MockTravelRepository.getInstance();

  console.log(`[makeTravelUseCases] Created with EXPO_PUBLIC_USE_API=${process.env.EXPO_PUBLIC_USE_API}`);

  const registerTravel= new RegisterTravel(travelRepository);
  const updateTravel= new UpdateTravel(travelRepository);
  const deleteTravel = new DeleteTravel(travelRepository);
  const findTravel= new FindTravel(travelRepository);
  const findAllTravel = new FindAllTravel(travelRepository)
  const findTravelByUserId = new FindTravelByUserId(travelRepository)

  const supabaseStorageRepository = new SupabaseStorageService
  const uploadFile = new UploadFileUseCase(supabaseStorageRepository)
  const deleteFile = new DeleteFileUseCase(supabaseStorageRepository)

  return {
    registerTravel,
    updateTravel,
    deleteTravel,
    findTravel,
    findAllTravel,
    findTravelByUserId,

    uploadFile,
    deleteFile
  };
}