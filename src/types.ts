/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StopRecord {
  id: string;
  name: string;
  arrivalTime: number;
  departureTime?: number;
  boardingCount: number;
  alightingCount: number;
  distanceFromPrevious: number; // in meters
  timeFromPrevious: number; // in seconds
  latitude: number;
  longitude: number;
}

export interface RouteRecord {
  id: string;
  startTime: number;
  endTime?: number;
  stops: StopRecord[];
  totalDistance: number;
}
