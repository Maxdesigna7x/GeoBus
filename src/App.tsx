/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Bus, MapPin, Navigation, Clock, Users, Download, Play, Square, Plus, Minus, CheckCircle, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { StopRecord, RouteRecord } from "./types";
import { calculateDistance, formatDistance, formatDuration } from "./utils/geoUtils";

export default function App() {
  // --- State ---
  const [isTracking, setIsTracking] = useState(false);
  const [isAtStop, setIsAtStop] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<RouteRecord | null>(null);
  const [currentStop, setCurrentStop] = useState<Partial<StopRecord> | null>(null);
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [totalDistance, setTotalDistance] = useState(0);
  const [distanceSinceLastStop, setDistanceSinceLastStop] = useState(0);
  const [lastRecordedPosition, setLastRecordedPosition] = useState<GeolocationPosition | null>(null);
  const [lastStopTime, setLastStopTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // --- Refs ---
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Effects ---
  useEffect(() => {
    if (isTracking) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTracking]);

  const handlePositionUpdate = useCallback((position: GeolocationPosition) => {
    setCurrentPosition(position);

    if (isTracking && lastRecordedPosition) {
      const dist = calculateDistance(
        lastRecordedPosition.coords.latitude,
        lastRecordedPosition.coords.longitude,
        position.coords.latitude,
        position.coords.longitude
      );

      // Only count if distance is significant (e.g., > 2m) to avoid GPS jitter
      if (dist > 2) {
        setTotalDistance((prev) => prev + dist);
        setDistanceSinceLastStop((prev) => prev + dist);
        setLastRecordedPosition(position);
      }
    } else if (isTracking && !lastRecordedPosition) {
      setLastRecordedPosition(position);
    }
  }, [isTracking, lastRecordedPosition]);

  useEffect(() => {
    if (isTracking) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePositionUpdate,
        (error) => console.error("Geolocation error:", error),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [isTracking, handlePositionUpdate]);

  // --- Handlers ---
  const startRoute = () => {
    const now = Date.now();
    const newRoute: RouteRecord = {
      id: `route-${now}`,
      startTime: now,
      stops: [],
      totalDistance: 0,
    };
    setCurrentRoute(newRoute);
    setIsTracking(true);
    setTotalDistance(0);
    setDistanceSinceLastStop(0);
    setLastStopTime(now);
    setElapsedTime(0);
  };

  const stopRoute = () => {
    if (!currentRoute) return;
    const now = Date.now();
    const finalRoute = { ...currentRoute, endTime: now, totalDistance };
    setCurrentRoute(finalRoute);
    setIsTracking(false);
    setIsAtStop(false);
  };

  const arriveAtStop = () => {
    if (!currentRoute || !currentPosition) return;
    const now = Date.now();
    const timeFromPrev = lastStopTime ? (now - lastStopTime) / 1000 : 0;

    setCurrentStop({
      id: `stop-${now}`,
      name: `Parada ${currentRoute.stops.length + 1}`,
      arrivalTime: now,
      boardingCount: 0,
      alightingCount: 0,
      distanceFromPrevious: distanceSinceLastStop,
      timeFromPrevious: timeFromPrev,
      latitude: currentPosition.coords.latitude,
      longitude: currentPosition.coords.longitude,
    });
    setIsAtStop(true);
  };

  const departFromStop = () => {
    if (!currentRoute || !currentStop) return;
    const now = Date.now();
    const completedStop: StopRecord = {
      ...(currentStop as StopRecord),
      departureTime: now,
    };

    setCurrentRoute((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        stops: [...prev.stops, completedStop],
      };
    });

    setIsAtStop(false);
    setCurrentStop(null);
    setDistanceSinceLastStop(0);
    setLastStopTime(now);
  };

  const updateBoarding = (delta: number) => {
    if (!currentStop) return;
    setCurrentStop((prev) => ({
      ...prev,
      boardingCount: Math.max(0, (prev?.boardingCount || 0) + delta),
    }));
  };

  const updateAlighting = (delta: number) => {
    if (!currentStop) return;
    setCurrentStop((prev) => ({
      ...prev,
      alightingCount: Math.max(0, (prev?.alightingCount || 0) + delta),
    }));
  };

  const downloadJSON = () => {
    if (!currentRoute) return;
    const dataStr = JSON.stringify(currentRoute, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ruta-bus-${currentRoute.startTime}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCSV = () => {
    if (!currentRoute) return;
    const headers = ["ID Parada", "Nombre", "Llegada", "Salida", "Suben", "Bajan", "Distancia (m)", "Tiempo desde anterior (s)", "Lat", "Lon"];
    const rows = currentRoute.stops.map((s) => [
      s.id,
      s.name,
      new Date(s.arrivalTime).toLocaleTimeString(),
      s.departureTime ? new Date(s.departureTime).toLocaleTimeString() : "-",
      s.boardingCount,
      s.alightingCount,
      s.distanceFromPrevious.toFixed(2),
      s.timeFromPrevious.toFixed(2),
      s.latitude,
      s.longitude,
    ]);

    const csvContent = [headers, ...rows].map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ruta-bus-${currentRoute.startTime}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 pb-24">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-100">
            <Bus size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">BusRoute</h1>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tracker v1.0</span>
          </div>
        </div>
        {isTracking && (
          <div className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider animate-pulse border border-red-100">
            <div className="w-2 h-2 bg-red-600 rounded-full"></div>
            GRABANDO RUTA
          </div>
        )}
      </header>

      <main className="max-w-md mx-auto space-y-6">
        {/* Dashboard Stats */}
        <section className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
              <Navigation size={12} />
              <span>Distancia</span>
            </div>
            <div className="text-2xl font-black text-slate-800 tabular-nums">{formatDistance(totalDistance)}</div>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
              <Clock size={12} />
              <span>Tiempo</span>
            </div>
            <div className="text-2xl font-black text-slate-800 tabular-nums">{formatDuration(elapsedTime)}</div>
          </div>
        </section>

        {/* Current Stop / Navigation Info */}
        <AnimatePresence mode="wait">
          {!isTracking ? (
            <motion.div
              key="start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 text-center space-y-6"
            >
              <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <Play size={48} fill="currentColor" className="ml-1" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">Nueva Ruta</h2>
                <p className="text-slate-500 mt-2 text-sm">Inicia el recorrido para registrar paradas, tiempos y pasajeros.</p>
              </div>
              <button
                onClick={startRoute}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-5 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-3 text-lg"
              >
                <Play size={24} fill="currentColor" />
                Comenzar Recorrido
              </button>
            </motion.div>
          ) : isAtStop ? (
            <motion.div
              key="at-stop"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-blue-600 text-white p-6 rounded-[2.5rem] shadow-2xl space-y-6 border-4 border-blue-500"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">En Parada</h2>
                  <h3 className="text-3xl font-black">{currentStop?.name}</h3>
                </div>
                <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                  <MapPin size={28} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 p-5 rounded-3xl space-y-4 backdrop-blur-sm border border-white/10">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60">
                    <Users size={14} />
                    <span>Suben</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <button onClick={() => updateBoarding(-1)} className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-xl active:bg-white/40 transition-colors"><Minus size={20} /></button>
                    <span className="text-4xl font-black tabular-nums">{currentStop?.boardingCount}</span>
                    <button onClick={() => updateBoarding(1)} className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-xl active:bg-white/40 transition-colors"><Plus size={20} /></button>
                  </div>
                </div>
                <div className="bg-white/10 p-5 rounded-3xl space-y-4 backdrop-blur-sm border border-white/10">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60">
                    <Users size={14} />
                    <span>Bajan</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <button onClick={() => updateAlighting(-1)} className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-xl active:bg-white/40 transition-colors"><Minus size={20} /></button>
                    <span className="text-4xl font-black tabular-nums">{currentStop?.alightingCount}</span>
                    <button onClick={() => updateAlighting(1)} className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-xl active:bg-white/40 transition-colors"><Plus size={20} /></button>
                  </div>
                </div>
              </div>

              <button
                onClick={departFromStop}
                className="w-full bg-white text-blue-600 font-black py-5 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 text-lg"
              >
                <ArrowRight size={24} />
                Continuar Ruta
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="moving"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-6"
            >
              <div className="flex justify-between items-center">
                <div className="space-y-2">
                  <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">En Movimiento</h2>
                  <div className="flex items-center gap-3 text-slate-800">
                    <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                      <Navigation size={20} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 block">Desde última parada</span>
                      <span className="text-xl font-black tabular-nums">{formatDistance(distanceSinceLastStop)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={arriveAtStop}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-5 rounded-2xl shadow-xl shadow-green-100 transition-all active:scale-95 flex items-center justify-center gap-3 text-lg"
                >
                  <MapPin size={24} />
                  Llegada a Parada
                </button>
                <button
                  onClick={stopRoute}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-400 p-5 rounded-2xl transition-all active:scale-95"
                  title="Finalizar Ruta"
                >
                  <Square size={24} fill="currentColor" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History / Stops List */}
        {currentRoute && currentRoute.stops.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between px-4">
              <h2 className="font-black text-slate-800 uppercase tracking-widest text-xs">Historial de Paradas</h2>
              <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                {currentRoute.stops.length} COMPLETADAS
              </span>
            </div>
            <div className="space-y-3">
              {currentRoute.stops.slice().reverse().map((stop) => (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={stop.id}
                  className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4"
                >
                  <div className="bg-slate-50 text-slate-300 p-3 rounded-2xl">
                    <CheckCircle size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="font-black text-slate-800 text-lg">{stop.name}</h4>
                      <span className="text-[10px] text-slate-400 font-bold tabular-nums bg-slate-50 px-2 py-1 rounded-md">
                        {new Date(stop.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                        <Users size={12} className="text-blue-500" />
                        <span>+{stop.boardingCount} / -{stop.alightingCount}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                        <Navigation size={12} className="text-slate-400" />
                        <span>{formatDistance(stop.distanceFromPrevious)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                        <Clock size={12} className="text-slate-400" />
                        <span>Estancia: {stop.departureTime ? formatDuration((stop.departureTime - stop.arrivalTime) / 1000) : "-"}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Export Options */}
        {currentRoute && (
          <section className="pt-6 border-t border-slate-200 space-y-4">
            <h2 className="font-black text-slate-800 uppercase tracking-widest text-xs px-4">Exportar Datos</h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={downloadJSON}
                className="bg-slate-900 text-white p-5 rounded-3xl font-black flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg shadow-slate-200"
              >
                <Download size={20} />
                JSON
              </button>
              <button
                onClick={downloadCSV}
                className="bg-slate-900 text-white p-5 rounded-3xl font-black flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg shadow-slate-200"
              >
                <Download size={20} />
                CSV
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Footer Status */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 p-4 flex justify-around items-center text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col items-center gap-1.5">
          <div className={`p-1.5 rounded-lg ${currentPosition ? "bg-green-50 text-green-600" : "bg-slate-50 text-slate-300"}`}>
            <Navigation size={18} />
          </div>
          <span>GPS: {currentPosition ? "ACTIVO" : "OFF"}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className={`p-1.5 rounded-lg ${isAtStop ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-300"}`}>
            <MapPin size={18} />
          </div>
          <span>ESTADO: {isAtStop ? "PARADA" : "RUTA"}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="p-1.5 rounded-lg bg-slate-50 text-slate-300">
            <Users size={18} />
          </div>
          <span>DATOS</span>
        </div>
      </footer>
    </div>
  );
}
