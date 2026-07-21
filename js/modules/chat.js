import { dbClient, state, updateTargetChatUser } from '../config.js';

let userUnreadCountsMap = {};
let isUpdatingReadStatus = false;
let locallyReadUsersSet = new Set(); 
let messageSubscription = null; 

let activeTargetUserId = null;

export function setupChatListeners() {
    const sendBtn = document.getElementById('sendChatMsgBtn');
    if (sendBtn) {
        sendBtn.removeEventListener('click', sendPrivateMessage);
        sendBtn.addEventListener('click', sendPrivateMessage);
    }
    
    const backBtn = document.getElementById('chatBackButton');
    if (backBtn) {
        backBtn.removeEventListener('click', showInboxView);
        backBtn.addEventListener('click', showInboxView);
    }
    
    const targetInput = document.getElementById('chatTargetUser');
    if (targetInput) {
        targetInput.removeEventListener('input', handleChatSearchInput);
        targetInput.addEventListener('input', handleChatSearchInput);
    }

    initRealtimeMessaging();

    if (state.currentUser && state.currentProfile) {
        checkChatNotificationsAndHistory();
    }
}

async function handleChatSearchInput() {
    const targetInput = document.getElementById('chatTargetUser');
    if (!targetInput) return;
    const queryText = targetInput.value.trim().replace('@', '').toLowerCase();
    await liveSearchUserProfiles(queryText);
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
                if (!newRecord || !state.currentUser) return;

                const involvedWithMe = 
                    newRecord.sender_id === state.currentUser.id || 
                    newRecord.receiver_id === state.currentUser.id;

                if (!involvedWithMe) return;

                if (payload.eventType === 'INSERT') {
                    const isFromActiveTarget = newRecord.sender_id === activeTargetUserId;
                    const isFromMeToActiveTarget = newRecord.receiver_id === activeTargetUserId;

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
    const title = document.getElementById('chatTargetTitle');
    if (title) title.innerText = `@${username}`;
    
    const avatar = document.getElementById('activeChatAvatar');
    if (avatar) avatar.innerText = username.substring(0, 2).toUpperCase();

    const inboxView = document.getElementById('chatInboxView');
    const convView = document.getElementById('chatConversationView');
    
    if (inboxView) inboxView.classList.add('hidden');
    if (convView) convView.classList.remove('hidden');
}

async function showInboxView() {
    activeTargetUserId = null;
    updateTargetChatUser('');
    const targetInput = document.getElementById('chatTargetUser');
    if (targetInput) targetInput.value = '';
    
    const inboxView = document.getElementById('chatInboxView');
    const convView = document.getElementById('chatConversationView');

    if (convView) convView.classList.add('hidden');
    if (inboxView) inboxView.classList.remove('hidden');
    
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
        .select('id, username')
        .ilike('username', `%${searchTerm}%`)
        .neq('id', state.currentUser?.id || '') 
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
            const targetInput = document.getElementById('chatTargetUser');
            if (targetInput) targetInput.value = profile.username;
            dropdown.innerHTML = '';
            dropdown.classList.add('hidden');
            selectHistoricChatUser(profile.id, profile.username);
        });
        dropdown.appendChild(item);
    });
}

export function runSystemSyncEngine() {
    return; 
}

function optimisticClearNotifications(partnerId) {
    locallyReadUsersSet.add(partnerId); 
    if (userUnreadCountsMap[partnerId]) {
        delete userUnreadCountsMap[partnerId];
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
        if (item.getAttribute('data-userid') === partnerId) {
            const badge = item.querySelector('.unread-badge-pill');
            if (badge) badge.remove();
        }
    });
}

async function markMessagesAsRead(senderId) {
    if (!state.currentUser || !senderId || isUpdatingReadStatus) return;
    isUpdatingReadStatus = true;
    try {
        await dbClient.from('private_messages')
            .update({ is_read: true })
            .match({
                sender_id: senderId,
                receiver_id: state.currentUser.id,
                is_read: false
            });
    } catch (err) {
        console.error(err);
    } finally {
        isUpdatingReadStatus = false;
    }
}

export async function checkChatNotificationsAndHistory() {
    if (!state.currentUser || !state.currentProfile) return;

    const { data: allUserMessages } = await dbClient.from('private_messages')
        .select('*')
        .or(`sender_id.eq.${state.currentUser.id},receiver_id.eq.${state.currentUser.id}`)
        .order('created_at', { ascending: false });

    if (!allUserMessages) return;

    let userLatestTimestampMap = new Map();
    let partnerInfoMap = new Map(); 
    let uniqueChattedUserIds = [];
    let absoluteUnreadGlobalCount = 0;
    let tempUnreadMap = {};

    const chatDrawer = document.getElementById('chatDrawer');
    const chatDrawerHidden = chatDrawer ? chatDrawer.classList.contains('hidden') : true;

    if (!chatDrawerHidden && activeTargetUserId) {
        locallyReadUsersSet.add(activeTargetUserId);
        const hasUnread = allUserMessages.some(m => m.sender_id === activeTargetUserId && !m.is_read);
        if (hasUnread) {
            await markMessagesAsRead(activeTargetUserId);
            allUserMessages.forEach(m => {
                if (m.sender_id === activeTargetUserId) m.is_read = true;
            });
        }
    }

    for (const msg of allUserMessages) {
        const isMe = msg.sender_id === state.currentUser.id;
        const partnerId = isMe ? msg.receiver_id : msg.sender_id;
        const partnerUsername = isMe ? msg.receiver_username : msg.sender_username;

        if (!userLatestTimestampMap.has(partnerId)) {
            userLatestTimestampMap.set(partnerId, new Date(msg.created_at).getTime());
            partnerInfoMap.set(partnerId, partnerUsername || 'user');
            uniqueChattedUserIds.push(partnerId);
        }

        if (msg.sender_id !== state.currentUser.id && !msg.is_read) {
            if (locallyReadUsersSet.has(msg.sender_id)) {
                msg.is_read = true; 
            } else {
                tempUnreadMap[msg.sender_id] = (tempUnreadMap[msg.sender_id] || 0) + 1;
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

    uniqueChattedUserIds.sort((a, b) => userLatestTimestampMap.get(b) - userLatestTimestampMap.get(a));

    const recentListContainer = document.getElementById('recentChatsList');
    if (!recentListContainer) return;
    recentListContainer.innerHTML = '';
    
    if (uniqueChattedUserIds.length === 0) {
        recentListContainer.innerHTML = `<span style="font-size:13px; color:#999; padding: 15px; text-align: center;">No active conversations</span>`;
        return;
    }

    uniqueChattedUserIds.forEach(partnerId => {
        const username = partnerInfoMap.get(partnerId) || 'user';
        const row = document.createElement('div');
        const isSelected = activeTargetUserId === partnerId;
        
        row.className = `recent-chat-row ${isSelected ? 'selected-user' : ''}`;
        row.setAttribute('data-userid', partnerId);
        row.setAttribute('data-username', username);

        const unreadTally = userUnreadCountsMap[partnerId] || 0;
        const notificationBadgeHTML = (unreadTally > 0 && !isSelected) 
            ? `<span class="unread-badge-pill" style="background:#25d366; color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">${unreadTally}</span>`
            : '';

        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:42px; height:42px; background:#f0f2f5; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#54656f; font-size:14px; border: 1px solid #e0e0e0;">${username.substring(0,2).toUpperCase()}</div>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600; font-size:15px; color:#000000;">@${username}</span>
                </div>
            </div>
            ${notificationBadgeHTML}
        `;
        
        row.addEventListener('click', () => selectHistoricChatUser(partnerId, username));
        recentListContainer.appendChild(row);
    });
}

async function selectHistoricChatUser(partnerId, username) {
    activeTargetUserId = partnerId;
    updateTargetChatUser(username);
    
    const targetInput = document.getElementById('chatTargetUser');
    if (targetInput) targetInput.value = username;
    
    openConversationScreen(username);
    optimisticClearNotifications(partnerId);
    await markMessagesAsRead(partnerId);
    await checkChatNotificationsAndHistory(); 
    fetchPrivateMessages();
}

async function sendPrivateMessage(e) {
    if (e) e.preventDefault();

    const msgInput = document.getElementById('chatMsgInput');
    if (!msgInput) return;

    const text = msgInput.value.trim();
    const receiverUsername = state.currentSelectedTargetUser;

    if (!activeTargetUserId || !text) return;
    locallyReadUsersSet.add(activeTargetUserId);

    const temporaryLocalMsgObj = {
        sender_id: state.currentUser.id,
        receiver_id: activeTargetUserId,
        sender_username: state.currentProfile.username,
        receiver_username: receiverUsername,
        message_text: text,
        created_at: new Date().toISOString()
    };
    appendSingleMessageToDOM(temporaryLocalMsgObj);
    msgInput.value = '';

    await dbClient.from('private_messages').insert([
        { 
            sender_id: state.currentUser.id,
            receiver_id: activeTargetUserId,
            sender_username: state.currentProfile.username, 
            receiver_username: receiverUsername, 
            message_text: text, 
            is_read: false 
        }
    ]);
}

function appendSingleMessageToDOM(msg) {
    const logsBox = document.getElementById('chatLogsBox');
    if (!logsBox) return;

    if (logsBox.innerHTML.includes("No active conversations") || logsBox.childNodes.length === 0) {
        logsBox.innerHTML = '';
    }

    const matches = Array.from(logsBox.childNodes).some(el => el.innerText === msg.message_text && el.getAttribute('data-timestamp'));
    if (matches && msg.sender_id === state.currentUser.id) return; 

    const bubble = document.createElement('div');
    const isMe = msg.sender_id === state.currentUser.id;
    
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
    if (!activeTargetUserId || !state.currentUser) return;

    const { data: messages } = await dbClient.from('private_messages')
        .select('*')
        .or(`and(sender_id.eq.${state.currentUser.id},receiver_id.eq.${activeTargetUserId}),and(sender_id.eq.${activeTargetUserId},receiver_id.eq.${state.currentUser.id})`)
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

const bootLoaderInterval = setInterval(() => {
    if (state.currentUser && state.currentProfile && document.getElementById('chatNotificationCount')) {
        setupChatListeners();
        clearInterval(bootLoaderInterval);
    }
}, 300);