// js/modules/notifications.js

import { dbClient, state } from '../config.js';

let notificationSubscription = null;
let isFetchingNotifications = false;

export function setupNotificationListeners() {
    if (!state.currentUser) return;

    if (notificationSubscription) {
        dbClient.removeChannel(notificationSubscription);
    }

    notificationSubscription = dbClient
        .channel('user-notifications-channel')
        .on(
            'postgres_changes',
            {
                event: '*',
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
    if (!state.currentUser || isFetchingNotifications) return;

    isFetchingNotifications = true;

    const notifListEl = document.getElementById('notificationsList');
    const badgeEl = document.getElementById('unreadBadge');

    try {
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
            if (notifListEl) notifListEl.innerHTML = `<li>No notifications</li>`;
            if (badgeEl) badgeEl.classList.add('hidden');
            return;
        }

        if (notifListEl) {
            notifListEl.innerHTML = notifications.map(notif => `
                <li class="notification-item ${notif.is_read ? 'read' : 'unread'}" data-id="${notif.id}">
                    <p>${notif.message}</p>
                    <small>${new Date(notif.created_at).toLocaleTimeString()}</small>
                </li>
            `).join('');

            notifListEl.querySelectorAll('.notification-item').forEach(item => {
                const notifId = item.getAttribute('data-id');
                item.addEventListener('click', () => markNotificationAsRead(notifId));
            });
        }

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
        console.error("Notification error:", err);
    } finally {
        isFetchingNotifications = false;
    }
}

async function markNotificationAsRead(notificationId) {
    if (!notificationId) return;

    await dbClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

    await fetchNotifications();
}