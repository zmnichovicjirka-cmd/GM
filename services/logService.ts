
type LogCallback = (msg: string) => void;
let listeners: LogCallback[] = [];

export const systemLog = (message: string) => {
  console.log(`[Neural-Log] ${message}`);
  listeners.forEach(cb => cb(message));
};

export const subscribeToLogs = (callback: LogCallback) => {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
};
