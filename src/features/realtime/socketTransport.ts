// Polyfills must run before evaluating the shared transport library.
import '../../lib/transport-polyfills';
export { TransportSocket, TransportSocketClient } from '@ts-core/socket-client';
