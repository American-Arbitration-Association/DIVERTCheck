//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
type Listener = () => void;

let activeRequestCount = 0;
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function incrementActiveRequestCount() {
  activeRequestCount += 1;
  notifyListeners();
}

export function decrementActiveRequestCount() {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  notifyListeners();
}

export function getActiveRequestCount() {
  return activeRequestCount;
}

export function subscribeToActiveRequestCount(listener: Listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
