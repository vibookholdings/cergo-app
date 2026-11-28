/**
 * Puerto para el PMS del hotel (fase 3). Cada PMS (Opera Cloud, AdminTour, Cloudbeds...)
 * es un adaptador que implementa esta interfaz; el negocio no cambia al sumar uno.
 */
export type AvailabilityQuery = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
};

export type RoomAvailability = { roomType: string; available: number; rateUsd: number | null };

export interface PmsAdapter {
  readonly name: string;
  /** `null` = este hotel no tiene PMS conectado. */
  availability(hotelId: string, query: AvailabilityQuery): Promise<RoomAvailability[] | null>;
}

export class NoPmsAdapter implements PmsAdapter {
  readonly name = "none";
  async availability(): Promise<RoomAvailability[] | null> {
    return null;
  }
}
