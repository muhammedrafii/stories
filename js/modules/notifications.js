// js/modules/notifications.js

import { dbClient, state } from '../config.js';

export function setupNotificationListeners() {
    // Register real-time updates or click triggers if needed
}

export async function fetchNotifications() {
    if (!state.currentUser) return;

    const notifListEl = document.getElementById('notificationsList');
    const badgeEl = document.getElementById('unreadBadge');

    try {
        // Example query targeting a 'notifications' table in Supabase
        const { data: notifications, error } = await dbClient
            .from('notifications')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Notifications fetch error:", error);
            return;
        }

        if (!notifications || notifications.length === 0) {
            if (notifListEl) notifListEl.innerHTML = `<li class="empty-state">No notifications yet.</li>`;
            if (badgeEl) badgeEl.classList.add('hidden');
            return;
        }

        // Render notifications
        if (notifListEl) {
            notifListEl.innerHTML = notifications.map(notif => `
                <li class="notification-item ${notif.is_read ? 'read' : 'unread'}">
                    <p class="notif-text">${notif.message || 'New notification'}</p>
                    <span class="notif-date">${new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </li>
            `).join('');
        }

        // Update badge count for unread notifications
        const unreadCount = notifications.filter(n => !n.is_read).length;
        if (badgeEl) {
            if (unreadCount > 0) {
                badgeEl.innerText = unreadCount;
                badgeEl.classList.remove('hidden');
            } else {
                badgeEl.classList.add('hidden');
            }
        }

    } catch (err) {
        console.error("Failed to load notifications:", err);
    }
}