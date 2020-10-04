// first n primes passed from the main thread
let primes: number[] = [];

export function next(from: number, limit: number): number {
  for (
    let i = (6 * Math.ceil((from + 2) / 6));
    i < limit;
    i += 6
  ) {
    if (sieve(i - 1) && sieve(i + 1) && prime(i - 1) && prime(i + 1)) {
      return i - 1;
    }
  }

  return 0;
}

export function sieve(n: number): number {
  if (
    n <= primes[primes.length - 1] || primes.every((v) => n % v)
  ) {
    return 1;
  } else {
    return 0;
  }
}

export function prime(n: number): number {
  for (let i = primes[primes.length - 1], s = Math.sqrt(n); i <= s; i += 2) {
    if (n % i === 0) {
      return 0;
    }
  }
  return 1;
}

export async function check(
  start: number,
  stop: number,
): Promise<number[]> {
  const twins: number[] = [];
  let latest = start;

  while (latest <= stop) {
    latest = next(latest, stop);
    if (latest) {
      twins.push(latest);
    } else {
      break;
    }
  }

  return twins;
}
