import { dbClient, state } from './config.js';
import { setActiveDrawer } from './auth.js';

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

export async function postTweet(e) {
    if (e) e.preventDefault(); // Stop any default form reload
    
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
        
        // Render target 1: Global public dashboard feed
        await renderFeedLayout(masterFeedArray, 'timelineFeed');

        // Render targets 2 & 3: Segments current user profile assets across drawers
        if (state.currentUser) {
            const currentUserId = state.currentUser?.id || state.currentUser?.user?.id;
            const myPosts = masterFeedArray.filter(post => String(post.user_id) === String(currentUserId));
            
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

    // Identify active logged-in user ID safely
    const currentUserId = state.currentUser?.id || state.currentUser?.user?.id;

    for (let post of postsArray) {
        const card = document.createElement('div');
        card.className = "tweet-card";
        
        const upvotes = post.upvotes || 0;
        const downvotes = post.downvotes || 0;
        const commentsList = masterCommentsMap[post.id] || [];

        // Check ownership as string to avoid ID type mismatch issues (UUID vs String)
        const isOwner = Boolean(currentUserId && String(currentUserId) === String(post.user_id));

        card.innerHTML = `
            <div class="tweet-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>@${post.username}</strong> 
                    <span style="font-size: 0.8em; color: #888;">${new Date(post.created_at).toLocaleDateString()}</span>
                </div>
                ${isOwner ? `
                    <button class="delete-post-btn" data-id="${post.id}" style="background: transparent; border: none; cursor: pointer; font-size: 16px;" title="Delete Post">
                        🗑️
                    </button>
                ` : ''}
            </div>
            <div class="tweet-body">${post.content}</div>
            <div class="tweet-actions">
                <button type="button" class="action-btn" data-id="${post.id}" data-action="up" style="background:none; border:none; cursor:pointer;">🔺 <span class="vote-count">${upvotes}</span></button>
                <button type="button" class="action-btn" data-id="${post.id}" data-action="down" style="background:none; border:none; cursor:pointer;">🔻 <span class="vote-count">${downvotes}</span></button>
                <button type="button" class="action-btn" data-id="${post.id}" data-action="comment-toggle" style="background:none; border:none; cursor:pointer;">💬 <span class="comment-count">${commentsList.length}</span></button>
            </div>
            
            <div id="commentBox-${containerId}-${post.id}" class="comment-drawer hidden">
                <div id="commentList-${containerId}-${post.id}">
                    ${commentsList.map(c => `<div class="comment-item"><strong>@${c.username}:</strong> ${c.comment_text}</div>`).join('')}
                </div>
                <div style="display:flex; gap:4px; margin-top:8px;">
                    <input type="text" id="cInput-${containerId}-${post.id}" placeholder="Write a comment..." style="flex:1; padding:4px; font-size:12px; border:1px solid #ccc;">
                    <button type="button" class="reply-submit-btn" data-id="${post.id}" style="padding:4px 8px; font-size:12px; cursor:pointer;">Reply</button>
                </div>
            </div>
        `;

        // Action listeners
        card.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Stop default button action / page refresh
                const act = btn.getAttribute('data-action');
                if (act === 'up' || act === 'down') vote(e, post.id, act, btn);
                if (act === 'comment-toggle') {
                    const box = document.getElementById(`commentBox-${containerId}-${post.id}`);
                    if (box) box.classList.toggle('hidden');
                }
            });
        });

        // Delete post listener
        const deleteBtn = card.querySelector('.delete-post-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                deletePost(post.id);
            });
        }

        const replyBtn = card.querySelector('.reply-submit-btn');
        if (replyBtn) {
            replyBtn.addEventListener('click', (e) => {
                e.preventDefault(); // Stop form submit page refresh
                submitComment(e, post.id, containerId, card);
            });
        }

        timeline.appendChild(card);
    }
}

export async function deletePost(postId) {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
        await dbClient.from('comments').delete().eq('post_id', postId);

        const { error } = await dbClient
            .from('posts')
            .delete()
            .eq('id', postId);

        if (error) throw error;

        await fetchTimelineTweets();
    } catch (error) {
        console.error("Error deleting post:", error);
        alert("Could not delete post: " + error.message);
    }
}

async function vote(e, postId, type, btnElement) {
    if (e) e.preventDefault();

    // 1. Instantly update UI count in local DOM
    const countSpan = btnElement.querySelector('.vote-count');
    if (countSpan) {
        countSpan.textContent = parseInt(countSpan.textContent || 0) + 1;
    }

    // 2. Perform DB update in background without calling fetchTimelineTweets()
    try {
        const fieldName = type === 'up' ? 'upvotes' : 'downvotes';
        const { data: post } = await dbClient.from('posts').select(fieldName).eq('id', postId).single();
        const currentVal = post ? (post[fieldName] || 0) : 0;
        
        await dbClient.from('posts').update({ 
            [fieldName]: currentVal + 1 
        }).eq('id', postId);
    } catch (err) {
        console.error("Error submitting vote:", err);
    }
}

async function submitComment(e, postId, containerId, cardElement) {
    if (e) e.preventDefault();

    const input = document.getElementById(`cInput-${containerId}-${postId}`);
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    const currentUsername = state.currentProfile?.username || 'User';

    try {
        // 1. Insert into DB
        const { error } = await dbClient.from('comments').insert([{ 
            post_id: postId, 
            username: currentUsername, 
            comment_text: text 
        }]);

        if (error) throw error;

        // 2. Append new comment directly to DOM (No full page reload/re-render)
        const commentList = document.getElementById(`commentList-${containerId}-${postId}`);
        if (commentList) {
            const newComment = document.createElement('div');
            newComment.className = 'comment-item';
            newComment.innerHTML = `<strong>@${currentUsername}:</strong> ${text}`;
            commentList.appendChild(newComment);
        }

        // 3. Increment comment counter icon dynamically
        const commentCountBtn = cardElement.querySelector('[data-action="comment-toggle"] .comment-count');
        if (commentCountBtn) {
            commentCountBtn.textContent = parseInt(commentCountBtn.textContent || 0) + 1;
        }

        input.value = ''; // Reset input box

    } catch (err) {
        console.error("Error posting comment:", err);
        alert("Could not post comment: " + err.message);
    }
}