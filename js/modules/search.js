import { dbClient } from '../config.js';
import { setViewingOtherProfile } from '../auth.js';

export async function searchApplicationUsers(searchQuery) {
    const cleanQuery = searchQuery.trim().toLowerCase();
    const resultsContainer = document.getElementById('searchResultsContainer');
    if (!resultsContainer) return;

    if (!cleanQuery) {
        resultsContainer.innerHTML = '';
        return;
    }

    const { data: users, error } = await dbClient
        .from('profiles')
        .select('id, username, display_name, bio')
        .or(`username.ilike.%${cleanQuery}%,display_name.ilike.%${cleanQuery}%`)
        .limit(15);

    if (error) {
        console.error("Search engine retrieval error:", error);
        return;
    }

    resultsContainer.innerHTML = '';
    
    if (users.length === 0) {
        resultsContainer.innerHTML = `<div class="search-no-results" style="padding: 12px; color: #888; text-align: center; font-size: 14px;">No matching users found</div>`;
        return;
    }

    users.forEach(user => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s; box-sizing: border-box; width: 100%;';
        
        item.onmouseenter = () => item.style.background = '#f9f9f9';
        item.onmouseleave = () => item.style.background = 'transparent';
        
        const userTitle = user.display_name || 'No Name Provided';
        const userHandle = user.username ? `@${user.username}` : '@user';
        const initialLetters = (user.username || 'US').substring(0, 2).toUpperCase();

        item.innerHTML = `
            <div style="width: 42px; height: 42px; border-radius: 50%; background: #4a90e2; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 14px; font-size: 0.95rem; flex-shrink: 0;">
                ${initialLetters}
            </div>
            <div style="flex-grow: 1; min-width: 0;">
                <div style="font-weight: 600; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; line-height: 1.2; margin-bottom: 2px;">${userTitle}</div>
                <div style="font-size: 0.85rem; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${userHandle}</div>
            </div>
        `;

        item.addEventListener('click', () => {
            setViewingOtherProfile({
                id: user.id,
                username: user.username || 'user',
                name: user.display_name || 'No Name Provided',
                bio: user.bio || 'No bio text yet.'
            });
        });

        resultsContainer.appendChild(item);
    });
}

export function setupSearchListeners() {
    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchApplicationUsers(e.target.value);
        });
    }
}