// js/modules/notifications.js

import { dbClient, state } from '../config.js';

let notificationSubscription = null;

export function setupNotificationListeners() {
    if (!state.currentUser) return;

    if (notificationSubscription) {
        dbClient.removeChannel(notificationSubscription);
    }

    // Set up real-time subscription for new notifications inserted into the database
    notificationSubscription = dbClient
        .channel('user-notifications-channel')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${state.currentUser.id}`
            },
            async () => {
                await fetchNotifications();
            }
        )
        .subscribe();
}

export async function fetchNotifications() {
    if (!state.currentUser) return;

    const notifListEl = document.getElementById('notificationsList');
    const badgeEl = document.getElementById('unreadBadge');

    try {
        // Query the notifications table to fetch activities (such as likes and dislikes on your posts)[cite: 6]
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
            if (notifListEl) notifListEl.innerHTML = `<li class="empty-state" style="font-size: 13px; color: var(--secondary-text);">No notifications yet.</li>`;
            if (badgeEl) badgeEl.classList.add('hidden');
            return;
        }

        // Render notifications showing who liked or disliked your posts[cite: 6]
        if (notifListEl) {
            notifListEl.innerHTML = notifications.map(notif => `
                <li class="notification-item ${notif.is_read ? 'read' : 'unread'}" style="padding: 10px; border-bottom: 1px solid #f0f0f0; background: ${notif.is_read ? '#fff' : '#f9f9f9'};">
                    <p class="notif-text" style="margin: 0 0 4px 0; font-size: 14px; color: #000;">${notif.message || 'New notification'}</p>
                    <span class="notif-date" style="font-size: 11px; color: #888;">${new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </li>
            `).join('');
        }

        // Update unread badge count[cite: 6]
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