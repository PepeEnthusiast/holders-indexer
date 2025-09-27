export type AddressBalanceDelta = { address: string; delta: bigint };

export function sumDeltas(deltaMap: Map<string, bigint>, address: string, value: bigint) {
    deltaMap.set(address, (deltaMap.get(address) ?? 0n) + value);
}

export function mergeDeltas(deltas: AddressBalanceDelta[]): AddressBalanceDelta[] {
    const merged = new Map<string, bigint>();
    deltas.forEach(({ address, delta }) => sumDeltas(merged, address, delta));
    return Array.from(merged, ([address, delta]) => ({ address, delta }));
}