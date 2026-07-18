import { dbClient, state, updateTargetChatUser } from './config.js';

let knownTotalMessagesCount = 0;

export function setupChatListeners() {
    document.getElementById('sendChatMsgBtn').addEventListener('click', sendPrivateMessage);
    document.getElementById('chatTargetUser').addEventListener('input', fetchPrivateMessages);
}

export function runSystemSyncEngine() {
    fetchPrivateMessages();
    checkChatNotificationsAndHistory();
}

async function checkChatNotificationsAndHistory() {
    if (!state.currentProfile) return;

    const { data: allUserMessages } = await dbClient.from('private_messages')
        .select('*')
        .or(`sender_username.eq.${state.currentProfile.username},receiver_username.eq.${state.currentProfile.username}`);

    if (!allUserMessages) return;

    let chattedUsersSet = new Set();
    let totalIncomingMessagesCount = 0;

    allUserMessages.forEach(msg => {
        if (msg.sender_username !== state.currentProfile.username) {
            chattedUsersSet.add(msg.sender_username);
            totalIncomingMessagesCount++;
        }
        if (msg.receiver_username !== state.currentProfile.username) {
            chattedUsersSet.add(msg.receiver_username);
        }
    });

    const chatDrawerHidden = document.getElementById('chatDrawer').classList.contains('hidden');
    if (chatDrawerHidden && knownTotalMessagesCount > 0 && totalIncomingMessagesCount > knownTotalMessagesCount) {
        const badge = document.getElementById('chatNotificationCount');
        badge.innerText = totalIncomingMessagesCount - knownTotalMessagesCount;
        badge.classList.remove('hidden');
    }
    
    if(knownTotalMessagesCount === 0 || totalIncomingMessagesCount > knownTotalMessagesCount) {
        knownTotalMessagesCount = totalIncomingMessagesCount;
    }

    const recentListContainer = document.getElementById('recentChatsList');
    recentListContainer.innerHTML = '';
    
    if(chattedUsersSet.size === 0) {
        recentListContainer.innerHTML = `<span style="font-size:11px; color:var(--secondary-text)">No recent history items found</span>`;
    }

    chattedUsersSet.forEach(user => {
        const pill = document.createElement('div');
        pill.className = `recent-chat-pill ${state.currentSelectedTargetUser === user ? 'selected-user' : ''}`;
        pill.innerText = `@${user}`;
        pill.addEventListener('click', () => selectHistoricChatUser(user));
        recentListContainer.appendChild(pill);
    });
}

function selectHistoricChatUser(username) {
    updateTargetChatUser(username);
    document.getElementById('chatTargetUser').value = username;
    document.getElementById('chatTargetTitle').innerText = `Chatting with: @${username}`;
    fetchPrivateMessages();
}

async function sendPrivateMessage() {
    const targetInput = document.getElementById('chatTargetUser');
    const msgInput = document.getElementById('chatMsgInput');
    
    const receiver = targetInput.value.trim().replace('@', '').toLowerCase();
    const text = msgInput.value.trim();

    if(!receiver || !text) return;
    updateTargetChatUser(receiver);

    await dbClient.from('private_messages').insert([
        { sender_username: state.currentProfile.username, receiver_username: receiver, message_text: text }
    ]);

    msgInput.value = '';
    fetchPrivateMessages();
}

async function fetchPrivateMessages() {
    const manualTarget = document.getElementById('chatTargetUser').value.trim().replace('@', '').toLowerCase();
    
    if (manualTarget && manualTarget !== state.currentSelectedTargetUser) {
        updateTargetChatUser(manualTarget);
        document.getElementById('chatTargetTitle').innerText = `Chatting with: @${manualTarget}`;
    }

    if(!state.currentSelectedTargetUser || !state.currentProfile) return;

    const { data: messages } = await dbClient.from('private_messages')
        .select('*')
        .or(`and(sender_username.eq.${state.currentProfile.username},receiver_username.eq.${state.currentSelectedTargetUser}),and(sender_username.eq.${state.currentSelectedTargetUser},receiver_username.eq.${state.currentProfile.username})`)
        .order('created_at', { ascending: true });

    const logsBox = document.getElementById('chatLogsBox');
    logsBox.innerHTML = '';

    if(messages) {
        messages.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.className = `msg-bubble ${msg.sender_username === state.currentProfile.username ? 'msg-sent' : 'msg-rcvd'}`;
            bubble.innerText = msg.message_text;
            logsBox.appendChild(bubble);
        });
        logsBox.scrollTop = logsBox.scrollHeight;
    }
}