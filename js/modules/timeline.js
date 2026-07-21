// js/modules/timeline.js
import { fetchNotifications } from './notifications.js';
import { dbClient, state } from '../config.js';
import { setActiveDrawer } from '../auth.js';

let masterFeedArray = [];
let timelineSubscription = null;

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

    setupRealtimeFeedListeners();
}

function setupRealtimeFeedListeners() {
    if (timelineSubscription) return;

    timelineSubscription = dbClient
        .channel('public-timeline-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
            fetchTimelineTweets();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => {
            fetchTimelineTweets();
        })
        .subscribe();
}

export async function postTweet(e) {
    if (e) e.preventDefault();
    
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
            const currentUserId = state.currentUser?.id || state.currentUser?.user?.id;
            const myPosts = masterFeedArray.filter(post => String(post.user_id) === String(currentUserId));
            
            if (document.getElementById('myPostsFeed')) {
                await renderFeedLayout(myPosts, 'myPostsFeed');
            }
            if (document.getElementById('myRecentPostsFeed')) {
                await renderFeedLayout(myPosts, 'myRecentPostsFeed');
            }

            const { data: myLikes } = await dbClient
                .from('post_votes')
                .select('post_id')
                .eq('user_id', currentUserId)
                .eq('vote_type', 'up');

            const likedPostIds = (myLikes || []).map(vote => vote.post_id);
            const likedPosts = masterFeedArray.filter(post => likedPostIds.includes(post.id));

            if (document.getElementById('likedPostsFeed')) {
                await renderFeedLayout(likedPosts, 'likedPostsFeed');
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
    if (postsArray.length === 0) {
        timeline.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No posts to show here.</div>';
        return;
    }

    const postIds = postsArray.map(p => p.id);
    let masterCommentsMap = {};
    let masterVotesMap = {};
    
    try {
        const [commentsRes, votesRes] = await Promise.all([
            dbClient.from('comments').select('*').in('post_id', postIds).order('created_at', { ascending: true }),
            dbClient.from('post_votes').select('*').in('post_id', postIds)
        ]);
            
        if (commentsRes.data) {
            commentsRes.data.forEach(comment => {
                if (!masterCommentsMap[comment.post_id]) masterCommentsMap[comment.post_id] = [];
                masterCommentsMap[comment.post_id].push(comment);
            });
        }

        if (votesRes.data) {
            votesRes.data.forEach(vote => {
                if (!masterVotesMap[vote.post_id]) masterVotesMap[vote.post_id] = { up: [], down: [] };
                if (vote.vote_type === 'up') masterVotesMap[vote.post_id].up.push(vote.user_id);
                if (vote.vote_type === 'down') masterVotesMap[vote.post_id].down.push(vote.user_id);
            });
        }
    } catch (err) {
        console.error("Error batch fetching relations:", err);
    }

    const currentUserId = state.currentUser?.id || state.currentUser?.user?.id;

    for (let post of postsArray) {
        const card = document.createElement('div');
        card.className = "tweet-card";
        card.setAttribute('data-post-id', post.id);
        
        const votesData = masterVotesMap[post.id] || { up: [], down: [] };
        const upvotes = votesData.up.length;
        const commentsList = masterCommentsMap[post.id] || [];

        const isOwner = Boolean(currentUserId && String(currentUserId) === String(post.user_id));
        const hasLiked = Boolean(currentUserId && votesData.up.includes(currentUserId));

        let likeIndicatorHTML = '';
        if (hasLiked) {
            likeIndicatorHTML = `<div class="vote-indicator" style="font-size: 0.75em; color: #0725ad; margin-top: 4px; font-weight: bold;"> You liked this</div>`;
        }

        card.innerHTML = `
            <div class="tweet-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>@${post.username}</strong> 
                    <span style="font-size: 0.8em; color: #888;">${new Date(post.created_at).toLocaleDateString()}</span>
                </div>
                ${isOwner ? `
                    <button type="button" class="delete-post-btn" data-id="${post.id}" style="background: transparent; border: none; cursor: pointer; font-size: 16px;" title="Delete Post">
                        🗑️
                    </button>
                ` : ''}
            </div>
            <div class="tweet-body">${post.content}</div>
            <div class="tweet-actions">
                <button type="button" class="action-btn like-btn" data-id="${post.id}" data-action="like" style="background:none; border:none; cursor:pointer; color:${hasLiked ? '#ef4444' : 'inherit'};">❤️ <span class="vote-count like-count">${upvotes}</span></button>
                <button type="button" class="action-btn" data-id="${post.id}" data-action="comment-toggle" style="background:none; border:none; cursor:pointer;">💬 <span class="comment-count">${commentsList.length}</span></button>
            </div>
            ${likeIndicatorHTML}
            
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

        card.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const act = btn.getAttribute('data-action');
                if (act === 'like') handleLike(post.id, card, post.user_id, post.content);
                if (act === 'comment-toggle') {
                    const box = document.getElementById(`commentBox-${containerId}-${post.id}`);
                    if (box) box.classList.toggle('hidden');
                }
            });
        });

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
                e.preventDefault();
                submitComment(e, post.id, containerId, card);
            });
        }

        timeline.appendChild(card);
    }
}

async function handleLike(postId, cardElement, postOwnerId, postContent) {
    if (!state.currentUser || !state.currentProfile) {
        alert("Login required");
        return;
    }

    const userId = state.currentUser.id;
    const username = state.currentProfile.username;

    try {
        const { data: existingVote } = await dbClient
            .from('post_votes')
            .select('*')
            .eq('post_id', postId)
            .eq('user_id', userId)
            .eq('vote_type', 'up')
            .maybeSingle();

        if (existingVote) {
            // UN-LIKE LOGIC
            await dbClient
                .from('post_votes')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', userId)
                .eq('vote_type', 'up');

            if (postOwnerId && postOwnerId !== userId) {
                await dbClient
                    .from('notifications')
                    .delete()
                    .eq('post_id', postId)
                    .eq('user_id', postOwnerId)
                    .eq('voter_id', userId);
            }
        } else {
            // LIKE LOGIC
            await dbClient.from('post_votes').insert([{
                post_id: postId,
                user_id: userId,
                username,
                vote_type: 'up'
            }]);

            if (postOwnerId && postOwnerId !== userId) {
                await dbClient
                    .from('notifications')
                    .delete()
                    .eq('post_id', postId)
                    .eq('user_id', postOwnerId)
                    .eq('voter_id', userId);

                const truncatedContent = postContent.length > 30 ? postContent.substring(0, 30) + '...' : postContent;
                const message = `@${username} liked your post "${truncatedContent}"`;
                
                await dbClient.from('notifications').insert([{
                    user_id: postOwnerId,
                    voter_id: userId,
                    post_id: postId,
                    message,
                    is_read: false
                }]);
            }
        }

        const { data: allVotes } = await dbClient
            .from('post_votes')
            .select('vote_type')
            .eq('post_id', postId)
            .eq('vote_type', 'up');

        const upvotesCount = (allVotes || []).length;

        await dbClient
            .from('posts')
            .update({ upvotes: upvotesCount, downvotes: 0 })
            .eq('id', postId);

        await fetchNotifications();
        await fetchTimelineTweets();

    } catch (err) {
        console.error("Like toggle error:", err);
    }
}

export async function deletePost(postId) {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
        await dbClient.from('comments').delete().eq('post_id', postId);
        await dbClient.from('post_votes').delete().eq('post_id', postId);
        await dbClient.from('notifications').delete().eq('post_id', postId);

        const { error } = await dbClient.from('posts').delete().eq('id', postId);
        if (error) throw error;

        await fetchTimelineTweets();
    } catch (error) {
        console.error("Error deleting post:", error);
        alert("Could not delete post: " + error.message);
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
        const { error } = await dbClient.from('comments').insert([{ 
            post_id: postId, 
            username: currentUsername, 
            comment_text: text 
        }]);

        if (error) throw error;

        const commentList = document.getElementById(`commentList-${containerId}-${postId}`);
        if (commentList) {
            const newComment = document.createElement('div');
            newComment.className = 'comment-item';
            newComment.innerHTML = `<strong>@${currentUsername}:</strong> ${text}`;
            commentList.appendChild(newComment);
        }

        const commentCountBtn = cardElement.querySelector('[data-action="comment-toggle"] .comment-count');
        if (commentCountBtn) {
            commentCountBtn.textContent = parseInt(commentCountBtn.textContent || 0) + 1;
        }

        input.value = ''; 
    } catch (err) {
        console.error("Error posting comment:", err);
        alert("Could not post comment: " + err.message);
    }
}