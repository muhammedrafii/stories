import { dbClient, state } from './config.js';
import { setActiveDrawer } from './auth.js';

let masterFeedArray = [];

export function setupTimelineListeners() {
    document.getElementById('submitTweetBtn').addEventListener('click', postTweet);
    document.getElementById('globalSearchInput').addEventListener('input', filterGlobalFeed);
}

export async function postTweet() {
    const input = document.getElementById('tweetText');
    const content = input.value.trim();
    if(!content) return;

    await dbClient.from('posts').insert([{ user_id: state.currentUser.id, username: state.currentProfile.username, content: content }]);
    input.value = '';
    setActiveDrawer(''); 
    fetchTimelineTweets();
}

export async function fetchTimelineTweets() {
    const { data: posts } = await dbClient.from('posts').select('*').order('created_at', { ascending: false });
    masterFeedArray = posts || [];
    renderFeedLayout(masterFeedArray);
}

function filterGlobalFeed() {
    const criteria = document.getElementById('globalSearchInput').value.trim().toLowerCase();
    const filtered = masterFeedArray.filter(post => post.username.toLowerCase().includes(criteria) || post.content.toLowerCase().includes(criteria));
    renderFeedLayout(filtered);
}

async function renderFeedLayout(postsArray) {
    const timeline = document.getElementById('timelineFeed');
    timeline.innerHTML = '';

    for (let post of postsArray) {
        const card = document.createElement('div');
        card.className = "tweet-card";
        
        const { data: comments } = await dbClient.from('comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true });
        const commentsList = comments || [];

        card.innerHTML = `
            <div class="tweet-header">@${post.username} <span>${new Date(post.created_at).toLocaleDateString()}</span></div>
            <div class="tweet-body">${post.content}</div>
            <div class="tweet-actions">
                <div class="action-btn" data-id="${post.id}" data-action="up">🔺 <span>${post.upvotes}</span></div>
                <div class="action-btn" data-id="${post.id}" data-action="down">🔻 <span>${post.downvotes}</span></div>
                <div class="action-btn" data-id="${post.id}" data-action="comment-toggle">💬 <span>${commentsList.length}</span></div>
            </div>
            
            <div id="commentBox-${post.id}" class="comment-drawer hidden">
                <div id="commentList-${post.id}">
                    ${commentsList.map(c => `<div class="comment-item"><strong>@${c.username}:</strong> ${c.comment_text}</div>`).join('')}
                </div>
                <div style="display:flex; gap:4px; margin-top:8px;">
                    <input type="text" id="cInput-${post.id}" placeholder="Write a comment..." style="flex:1; padding:4px; font-size:12px; border:1px solid #ccc;">
                    <button class="reply-submit-btn" data-id="${post.id}" style="padding:4px 8px; font-size:12px; cursor:pointer;">Reply</button>
                </div>
            </div>
        `;

        // Bind internal structural nodes dynamic listener clicks
        card.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = post.id;
                const act = btn.getAttribute('data-action');
                if(act === 'up') vote(id, 'up', post.upvotes);
                if(act === 'down') vote(id, 'down', post.downvotes);
                if(act === 'comment-toggle') document.getElementById(`commentBox-${id}`).classList.toggle('hidden');
            });
        });

        card.querySelector('.reply-submit-btn').addEventListener('click', () => submitComment(post.id));

        timeline.appendChild(card);
    }
}

async function vote(postId, type, currentVal) {
    const updatedVal = currentVal + 1;
    const updatePayload = type === 'up' ? { upvotes: updatedVal } : { downvotes: updatedVal };
    await dbClient.from('posts').update(updatePayload).eq('id', postId);
    fetchTimelineTweets();
}

async function submitComment(postId) {
    const input = document.getElementById(`cInput-${postId}`);
    const text = input.value.trim();
    if(!text) return;

    await dbClient.from('comments').insert([{ post_id: postId, username: state.currentProfile.username, comment_text: text }]);
    input.value = '';
    fetchTimelineTweets();
}