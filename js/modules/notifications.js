import { checkChatNotificationsAndHistory } from './chat.js';

export function initNotificationsEngine() {
    // Poll for notifications or set up realtime channel triggers
    checkChatNotificationsAndHistory();
}