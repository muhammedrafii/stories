import { dbClient, state } from '../config.js';
import { setActiveDrawer } from '../auth.js';
import { formatDate } from '../utils/date.js';

let masterFeedArray = [];

export function setupTimelineListeners() {
    const submitBtn = document.getElementById('submitTweetBtn');
    const searchInput = document.getElementById('globalSearchInput');

    if (submitBtn) {
        submitBtn.removeEventListener('click', postTweet);
        submitBtn.addEventListener('click', postTweet);
    }
    
    if (searchInput) {
        searchInput.removeEventListener('input', filterGlobalFeed);
        searchInput.addEventListener('input', filterGlobalFeed);
    }
}

export async function postTweet() {
    const input = document.getElementById('tweetText');
    if (!input) return;

    const content = input.value.trim();
    if (!content) return;

    try {
        const { error } = await dbClient.from('posts').insert([{ 
            user_id: state.currentUser.id, 
            username: state.currentProfile.username, 
            content: content 
        }]);

        if (error) throw error;
        
        input.value = '';
        setActiveDrawer(''); 
        alert("Post created successfully!");
        await fetchTimelineTweets();

    } catch (error) {
        console.error("Error publishing post:", error);
        alert("Could not publish post: " + error.message);
    }
}

export async function fetchTimelineTweets() {
    try {
        const { data: posts, error } = await dbClient
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;

        masterFeedArray = posts || [];
        
        await renderFeedLayout(masterFeedArray, 'timelineFeed');

        if (state.currentUser) {
            const myPosts = masterFeedArray.filter(post => post.user_id === state.currentUser.id);
            
            if (document.getElementById('myPostsFeed')) {
                await renderFeedLayout(myPosts, 'myPostsFeed');
            }
            
            if (document.getElementById('myRecentPostsFeed')) {
                await renderFeedLayout(myPosts, 'myRecentPostsFeed');
            }
        }
    } catch (error) {
        console.error("Error fetching tweets:", error);
    }
}

function filterGlobalFeed() {
    const searchInput = document.getElementById('globalSearchInput');
    if (!searchInput) return;

    const criteria = searchInput.value.trim().toLowerCase();
    const filtered = masterFeedArray.filter(post => 
        post.username.toLowerCase().includes(criteria) || post.content.toLowerCase().includes(criteria)
    );
    renderFeedLayout(filtered, 'timelineFeed');
}

async function renderFeedLayout(postsArray, containerId) {
    const timeline = document.getElementById(containerId);
    if (!timeline) return; 
    
    timeline.innerHTML = '';
    if (postsArray.length === 0) return;

    const postIds = postsArray.map(p => p.id);
    let masterCommentsMap = {};
    
    try {
        const { data: allComments } = await dbClient
            .from('comments')
            .select('*')
            .in('post_id', postIds)
            .order('created_at', { ascending: true });
            
        if (allComments) {
            allComments.forEach(comment => {
                if (!masterCommentsMap[comment.post_id]) {
                    masterCommentsMap[comment.post_id] = [];
                }
                masterCommentsMap[comment.post_id].push(comment);
            });
        }
    } catch (err) {
        console.error("Error batch fetching comments:", err);
    }

    for (let post of postsArray) {
        const card = document.createElement('div');
        card.className = "tweet-card";
        
        const upvotes = post.upvotes || 0;
        const downvotes = post.downvotes || 0;
        const commentsList = masterCommentsMap[post.id] || [];

        card.innerHTML = `
            <div class="tweet-header">@${post.username} <span>${formatDate(post.created_at)}</span></div>
            <div class="tweet-body">${post.content}</div>
            <div class="tweet-actions">
                <div class="action-btn" data-id="${post.id}" data-action="up">🔺 <span>${upvotes}</span></div>
                <div class="action-btn" data-id="${post.id}" data-action="down">🔻 <span>${downvotes}</span></div>
                <div class="action-btn" data-id="${post.id}" data-action="comment-toggle">💬 <span>${commentsList.length}</span></div>
            </div>
            
            <div id="commentBox-${containerId}-${post.id}" class="comment-drawer hidden">
                <div id="commentList-${containerId}-${post.id}">
                    ${commentsList.map(c => `<div class="comment-item"><strong>@${c.username}:</strong> ${c.comment_text}</div>`).join('')}
                </div>
                <div style="display:flex; gap:4px; margin-top:8px;">
                    <input type="text" id="cInput-${containerId}-${post.id}" placeholder="Write a comment..." style="flex:1; padding:4px; font-size:12px; border:1px solid #ccc;">
                    <button class="reply-submit-btn" data-id="${post.id}" style="padding:4px 8px; font-size:12px; cursor:pointer;">Reply</button>
                </div>
            </div>
        `;

        card.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const act = btn.getAttribute('data-action');
                if(act === 'up') vote(post.id, 'up');
                if(act === 'down') vote(post.id, 'down');
                if(act === 'comment-toggle') {
                    const box = document.getElementById(`commentBox-${containerId}-${post.id}`);
                    if (box) box.classList.toggle('hidden');
                }
            });
        });

        const replyBtn = card.querySelector('.reply-submit-btn');
        if (replyBtn) {
            replyBtn.addEventListener('click', () => submitComment(post.id, containerId));
        }

        timeline.appendChild(card);
    }
}

async function vote(postId, type) {
    const { data: post } = await dbClient.from('posts').select(type === 'up' ? 'upvotes' : 'downvotes').eq('id', postId).single();
    const currentVal = post ? (post[type === 'up' ? 'upvotes' : 'downvotes'] || 0) : 0;
    
    await dbClient.from('posts').update({ 
        [type === 'up' ? 'upvotes' : 'downvotes']: currentVal + 1 
    }).eq('id', postId);
    
    fetchTimelineTweets();
}

async function submitComment(postId, containerId) {
    const input = document.getElementById(`cInput-${containerId}-${postId}`);
    if (!input) return;

    const text = input.value.trim();
    if(!text) return;

    await dbClient.from('comments').insert([{ 
        post_id: postId, 
        username: state.currentProfile.username, 
        comment_text: text 
    }]);
    
    input.value = '';
    fetchTimelineTweets();
}