import { io } from 'socket.io-client';

// Single shared socket instance for the whole app
const socket = io({ autoConnect: true });
export default socket;
