// A hard deadline over work that may never settle: whichever comes first, the
// work's answer or the timeout's, wins, and the timer is always cleared so a
// settled race never keeps the process alive.

export interface DeadlineRace<T> {
  // Called after the timer is armed, so the deadline covers everything the
  // work does from its first synchronous step on.
  start: () => Promise<T>;
  ms: number;
  // The answer when the deadline wins; runs inside the timer callback, before
  // the race settles, so it may also cancel the work (an AbortController).
  onTimeout: () => T;
}

export async function raceDeadline<T>({ start, ms, onTimeout }: DeadlineRace<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((settle) => {
    timer = setTimeout(() => settle(onTimeout()), ms);
  });
  try {
    return await Promise.race([start(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
