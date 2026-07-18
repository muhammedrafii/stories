import { dbClient, state, updateTargetChatUser } from './config.js';

let userUnreadCountsMap = {};
let isUpdatingReadStatus = false;
let locallyReadUsersSet = new Set(); 
let messageSubscription = null; 

export function setupChatListeners() {
    document.getElementById('sendChatMsgBtn').addEventListener('click', sendPrivateMessage);
    
    const backBtn = document.getElementById('chatBackButton');
    if (backBtn) {
        backBtn.addEventListener('click', showInboxView);
    }
    
    const targetInput = document.getElementById('chatTargetUser');
    targetInput.addEventListener('input', async () => {
        const queryText = targetInput.value.trim().replace('@', '').toLowerCase();
        liveSearchUserProfiles(queryText);
    });

    initRealtimeMessaging();

    if (state.currentProfile) {
        checkChatNotificationsAndHistory();
    }
}

function initRealtimeMessaging() {
    if (messageSubscription) {
        dbClient.removeChannel(messageSubscription);
    }

    messageSubscription = dbClient
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'private_messages' },
            async (payload) => {
                const newRecord = payload.new;
                if (!newRecord || !state.currentProfile) return;

                const involvedWithMe = 
                    newRecord.sender_username === state.currentProfile.username || 
                    newRecord.receiver_username === state.currentProfile.username;

                if (!involvedWithMe) return;

                if (payload.eventType === 'INSERT') {
                    const isFromActiveTarget = newRecord.sender_username === state.currentSelectedTargetUser;
                    const isFromMeToActiveTarget = newRecord.receiver_username === state.currentSelectedTargetUser;

                    if (isFromActiveTarget || isFromMeToActiveTarget) {
                        appendSingleMessageToDOM(newRecord);
                    }
                }

                await checkChatNotificationsAndHistory();
            }
        )
        .subscribe();
}

function openConversationScreen(username) {
    document.getElementById('chatTargetTitle').innerText = `@${username}`;
    const avatar = document.getElementById('activeChatAvatar');
    if (avatar) avatar.innerText = username.substring(0, 2).toUpperCase();

    document.getElementById('chatInboxView').classList.add('hidden');
    document.getElementById('chatConversationView').classList.remove('hidden');
}

async function showInboxView() {
    updateTargetChatUser('');
    document.getElementById('chatTargetUser').value = '';
    document.getElementById('chatConversationView').classList.add('hidden');
    document.getElementById('chatInboxView').classList.remove('hidden');
    await checkChatNotificationsAndHistory(); 
}

async function liveSearchUserProfiles(searchTerm) {
    const dropdown = document.getElementById('chatSearchDropdown');
    if (!dropdown) return;

    if (!searchTerm || searchTerm.length < 1) {
        dropdown.innerHTML = '';
        dropdown.classList.add('hidden');
        return;
    }

    const { data: matchedProfiles } = await dbClient
        .from('profiles')
        .select('username')
        .ilike('username', `%${searchTerm}%`)
        .neq('username', state.currentProfile?.username || '') 
        .limit(5);

    if (!matchedProfiles || matchedProfiles.length === 0) {
        dropdown.innerHTML = `<div style="padding: 12px; color: #666; font-size: 14px; background:#fff;">No users found</div>`;
        dropdown.classList.remove('hidden');
        return;
    }

    dropdown.innerHTML = '';
    dropdown.classList.remove('hidden');

    matchedProfiles.forEach(profile => {
        const item = document.createElement('div');
        item.style.padding = '12px 14px';
        item.style.cursor = 'pointer';
        item.style.borderBottom = '1px solid #f0f0f0';
        item.style.fontSize = '14px';
        item.style.color = '#000';
        item.style.background = '#fff';
        item.innerText = `@${profile.username}`;
        
        item.addEventListener('mouseenter', () => item.style.background = '#f5f5f5');
        item.addEventListener('mouseleave', () => item.style.background = '#fff');
        
        item.addEventListener('click', () => {
            document.getElementById('chatTargetUser').value = profile.username;
            dropdown.innerHTML = '';
            dropdown.classList.add('hidden');
            selectHistoricChatUser(profile.username);
        });
        dropdown.appendChild(item);
    });
}

export function runSystemSyncEngine() {
    return; 
}

function optimisticClearNotifications(username) {
    locallyReadUsersSet.add(username); 
    if (userUnreadCountsMap[username]) {
        delete userUnreadCountsMap[username];
    }
    
    let absoluteUnreadGlobalCount = Object.values(userUnreadCountsMap).reduce((a, b) => a + b, 0);
    const globalBadge = document.getElementById('chatNotificationCount');
    if (globalBadge) {
        if (absoluteUnreadGlobalCount > 0) {
            globalBadge.innerText = absoluteUnreadGlobalCount;
            globalBadge.classList.remove('hidden');
        } else {
            globalBadge.innerText = "0";
            globalBadge.classList.add('hidden');
        }
    }

    const items = document.querySelectorAll('.recent-chat-row');
    items.forEach(item => {
        if (item.getAttribute('data-username') === username) {
            const badge = item.querySelector('.unread-badge-pill');
            if (badge) badge.remove();
        }
    });
}

async function markMessagesAsRead(senderUsername) {
    if (!state.currentProfile || !senderUsername || isUpdatingReadStatus) return;
    isUpdatingReadStatus = true;
    try {
        await dbClient.from('private_messages')
            .update({ is_read: true })
            .match({
                sender_username: senderUsername,
                receiver_username: state.currentProfile.username,
                is_read: false
            });
    } catch (err) {
        console.error(err);
    } finally {
        isUpdatingReadStatus = false;
    }
}

export async function checkChatNotificationsAndHistory() {
    if (!state.currentProfile) return;

    const { data: allUserMessages } = await dbClient.from('private_messages')
        .select('*')
        .or(`sender_username.eq.${state.currentProfile.username},receiver_username.eq.${state.currentProfile.username}`)
        .order('created_at', { ascending: false });

    if (!allUserMessages) return;

    let userLatestTimestampMap = new Map();
    let uniqueChattedUsers = [];
    let absoluteUnreadGlobalCount = 0;
    let tempUnreadMap = {};

    const chatDrawer = document.getElementById('chatDrawer');
    const chatDrawerHidden = chatDrawer ? chatDrawer.classList.contains('hidden') : true;

    if (!chatDrawerHidden && state.currentSelectedTargetUser) {
        locallyReadUsersSet.add(state.currentSelectedTargetUser);
        const hasUnread = allUserMessages.some(m => m.sender_username === state.currentSelectedTargetUser && !m.is_read);
        if (hasUnread) {
            await markMessagesAsRead(state.currentSelectedTargetUser);
            allUserMessages.forEach(m => {
                if (m.sender_username === state.currentSelectedTargetUser) m.is_read = true;
            });
        }
    }

    for (const msg of allUserMessages) {
        const partner = msg.sender_username === state.currentProfile.username ? msg.receiver_username : msg.sender_username;
        
        if (!userLatestTimestampMap.has(partner)) {
            userLatestTimestampMap.set(partner, new Date(msg.created_at).getTime());
            uniqueChattedUsers.push(partner);
        }

        if (msg.sender_username !== state.currentProfile.username && !msg.is_read) {
            if (locallyReadUsersSet.has(msg.sender_username)) {
                msg.is_read = true; 
            } else {
                tempUnreadMap[msg.sender_username] = (tempUnreadMap[msg.sender_username] || 0) + 1;
                absoluteUnreadGlobalCount++;
            }
        }
    }

    userUnreadCountsMap = tempUnreadMap;

    const globalBadge = document.getElementById('chatNotificationCount');
    if (globalBadge) {
        if (absoluteUnreadGlobalCount > 0) {
            globalBadge.innerText = absoluteUnreadGlobalCount;
            globalBadge.classList.remove('hidden');
        } else {
            globalBadge.innerText = "0";
            globalBadge.classList.add('hidden'); 
        }
    }

    uniqueChattedUsers.sort((a, b) => userLatestTimestampMap.get(b) - userLatestTimestampMap.get(a));

    const recentListContainer = document.getElementById('recentChatsList');
    if (!recentListContainer) return; // Prevent crashes if elements aren't visible yet
    recentListContainer.innerHTML = '';
    
    if (uniqueChattedUsers.length === 0) {
        recentListContainer.innerHTML = `<span style="font-size:13px; color:#999; padding: 15px; text-align: center;">No active conversations</span>`;
        return;
    }

    uniqueChattedUsers.forEach(user => {
        const row = document.createElement('div');
        const isSelected = state.currentSelectedTargetUser === user;
        
        row.className = `recent-chat-row ${isSelected ? 'selected-user' : ''}`;
        row.setAttribute('data-username', user);

        const unreadTally = userUnreadCountsMap[user] || 0;
        const notificationBadgeHTML = (unreadTally > 0 && !isSelected) 
            ? `<span class="unread-badge-pill" style="background:#25d366; color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">${unreadTally}</span>`
            : '';

        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:42px; height:42px; background:#f0f2f5; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#54656f; font-size:14px; border: 1px solid #e0e0e0;">${user.substring(0,2).toUpperCase()}</div>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600; font-size:15px; color:#000000;">@${user}</span>
                </div>
            </div>
            ${notificationBadgeHTML}
        `;
        
        row.addEventListener('click', () => selectHistoricChatUser(user));
        recentListContainer.appendChild(row);
    });
}

async function selectHistoricChatUser(username) {
    updateTargetChatUser(username);
    document.getElementById('chatTargetUser').value = username;
    
    openConversationScreen(username);
    optimisticClearNotifications(username);
    await markMessagesAsRead(username);
    await checkChatNotificationsAndHistory(); 
    fetchPrivateMessages();
}

async function sendPrivateMessage() {
    const msgInput = document.getElementById('chatMsgInput');
    const text = msgInput.value.trim();
    const receiver = state.currentSelectedTargetUser;

    if (!receiver || !text) return;
    locallyReadUsersSet.add(receiver);

    const temporaryLocalMsgObj = {
        sender_username: state.currentProfile.username,
        receiver_username: receiver,
        message_text: text,
        created_at: new Date().toISOString()
    };
    appendSingleMessageToDOM(temporaryLocalMsgObj);
    msgInput.value = '';

    await dbClient.from('private_messages').insert([
        { sender_username: state.currentProfile.username, receiver_username: receiver, message_text: text, is_read: false }
    ]);
}

function appendSingleMessageToDOM(msg) {
    const logsBox = document.getElementById('chatLogsBox');
    if (!logsBox) return;

    if (logsBox.innerHTML.includes("No active conversations") || logsBox.childNodes.length === 0) {
        logsBox.innerHTML = '';
    }

    const matches = Array.from(logsBox.childNodes).some(el => el.innerText === msg.message_text && el.getAttribute('data-timestamp'));
    if (matches && msg.sender_username === state.currentProfile.username) return; 

    const bubble = document.createElement('div');
    const isMe = msg.sender_username === state.currentProfile.username;
    
    bubble.className = `msg-bubble ${isMe ? 'msg-sent' : 'msg-rcvd'}`;
    bubble.innerText = msg.message_text;
    bubble.setAttribute('data-timestamp', new Date(msg.created_at).getTime());
    
    bubble.style.padding = '8px 12px';
    bubble.style.borderRadius = '8px';
    bubble.style.fontSize = '14px';
    bubble.style.maxWidth = '75%';
    bubble.style.wordBreak = 'break-word';
    bubble.style.boxShadow = '0 1px 1px rgba(0,0,0,0.1)';
    bubble.style.color = '#000000';
    
    if (isMe) {
        bubble.style.alignSelf = 'flex-end';
        bubble.style.background = '#d9fdd3'; 
        bubble.style.borderTopRightRadius = '0px'; 
    } else {
        bubble.style.alignSelf = 'flex-start';
        bubble.style.background = '#ffffff'; 
        bubble.style.borderTopLeftRadius = '0px'; 
    }
    
    logsBox.appendChild(bubble);
    logsBox.scrollTop = logsBox.scrollHeight;
}

export async function fetchPrivateMessages() {
    if (!state.currentSelectedTargetUser || !state.currentProfile) return;

    const { data: messages } = await dbClient.from('private_messages')
        .select('*')
        .or(`and(sender_username.eq.${state.currentProfile.username},receiver_username.eq.${state.currentSelectedTargetUser}),and(sender_username.eq.${state.currentSelectedTargetUser},receiver_username.eq.${state.currentProfile.username})`)
        .order('created_at', { ascending: true });

    const logsBox = document.getElementById('chatLogsBox');
    if (!logsBox) return;
    logsBox.innerHTML = '';

    if (messages) {
        messages.forEach(msg => {
            appendSingleMessageToDOM(msg);
        });
    }
}

/**
 * SELF-STARTING INITIALIZER
 * Runs immediately on app startup/login. Automatically polls for `state.currentProfile` 
 * and connects notifications instantly without requiring any button interactions.
 */
const bootLoaderInterval = setInterval(() => {
    if (state.currentProfile && document.getElementById('chatNotificationCount')) {
        setupChatListeners();
        clearInterval(bootLoaderInterval);
    }
}, 300);