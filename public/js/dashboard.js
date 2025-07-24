<script>
        class OsuDashboard {
            constructor() {
                this.currentUser = null;
                this.favorites = JSON.parse(localStorage.getItem('osu_favorites') || '[]');
                this.settings = JSON.parse(localStorage.getItem('osu_settings') || '{}');
                this.activityPage = 1;
                this.chart = null;
                this.isDarkMode = localStorage.getItem('darkMode') === 'true';
                this.init();
            }

            init() {
                this.setupEventListeners();
                this.checkLoginStatus();
                this.handleURLParams();
                this.loadChart();
                this.applyTheme();
                this.loadFavorites();
            }

            setupEventListeners() {
                // Tab switching
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
                });

                // Search functionality
                document.getElementById('searchBtn').addEventListener('click', () => this.searchBeatmaps());
                document.getElementById('searchInput').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.searchBeatmaps();
                });

                // Beatmap info
                document.getElementById('beatmapBtn').addEventListener('click', () => this.getBeatmapInfo());
                document.getElementById('beatmapInput').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.getBeatmapInfo();
                });

                // Leaderboard
                document.getElementById('leaderboardBtn').addEventListener('click', () => this.getUserScores());

                // Compare users
                document.getElementById('compareBtn').addEventListener('click', () => this.compareUsers());

                // Calculator
                document.getElementById('calculateBtn').addEventListener('click', () => this.calculateDifficulty());

                // Theme toggle
                document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

                // Recommendation tabs
                document.querySelectorAll('[data-rec]').forEach(tab => {
                    tab.addEventListener('click', (e) => this.loadRecommendations(e.target.dataset.rec));
                });

                // Advanced search filters
                document.getElementById('advancedSearchBtn').addEventListener('click', () => this.advancedSearch());
                document.getElementById('resetFiltersBtn').addEventListener('click', () => this.resetFilters());

                // Range sliders
                this.setupRangeSliders();

                // Export/Import
                document.getElementById('exportScoresBtn').addEventListener('click', () => this.exportData('scores'));
                document.getElementById('exportFavoritesBtn').addEventListener('click', () => this.exportData('favorites'));
                document.getElementById('exportStatsBtn').addEventListener('click', () => this.exportData('stats'));
                document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
                document.getElementById('importFile').addEventListener('change', (e) => this.importData(e));

                // Quick actions
                document.getElementById('quickActionBtn').addEventListener('click', () => this.toggleQuickMenu());

                // Load more activity
                document.getElementById('loadMoreActivity')?.addEventListener('click', () => this.loadMoreActivity());

                // Logout
                document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

                // Keyboard shortcuts
                document.addEventListener('keydown', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        switch(e.key) {
                            case 'k':
                                e.preventDefault();
                                document.getElementById('searchInput').focus();
                                break;
                            case '1':
                                e.preventDefault();
                                this.switchTab('search');
                                break;
                            case '2':
                                e.preventDefault();
                                this.switchTab('beatmap');
                                break;
                            case '3':
                                e.preventDefault();
                                this.switchTab('leaderboard');
                                break;
                        }
                    }
                });
            }

            handleURLParams() {
                const params = new URLSearchParams(window.location.search);
                if (params.get('login') === 'success') {
                    this.showNotification('Successfully logged in!', 'success');
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
                if (params.get('error') === 'oauth_failed') {
                    this.showNotification('Login failed. Please try again.', 'error');
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            }

            async checkLoginStatus() {
                try {
                    const response = await fetch('/api/me');
                    if (response.ok) {
                        this.currentUser = await response.json();
                        this.updateUserInterface();
                        this.loadUserProfile();
                    }
                } catch (error) {
                    console.log('Not logged in');
                }
            }

            updateUserInterface() {
                if (this.currentUser) {
                    document.getElementById('loginSection').classList.add('hidden');
                    document.getElementById('userSection').classList.remove('hidden');
                    document.getElementById('userAvatar').src = this.currentUser.avatar_url;
                    document.getElementById('username').textContent = this.currentUser.username;
                    document.getElementById('userRank').textContent = `#${this.currentUser.statistics.global_rank?.toLocaleString() || 'Unranked'}`;
                    document.getElementById('profileCard').style.display = 'block';
                    document.getElementById('statsCard').style.display = 'block';
                    document.getElementById('chartCard').style.display = 'block';
                    document.getElementById('activityCard').style.display = 'block';
                    document.getElementById('favoritesCard').style.display = 'block';
                    document.getElementById('recommendationsCard').style.display = 'block';
                    document.getElementById('dataCard').style.display = 'block';
                    this.loadRecentActivity();
                    this.loadRecommendations('skill');
                } else {
                    document.getElementById('loginSection').classList.remove('hidden');
                    document.getElementById('userSection').classList.add('hidden');
                    document.getElementById('profileCard').style.display = 'none';
                    document.getElementById('statsCard').style.display = 'none';
                    document.getElementById('chartCard').style.display = 'none';
                    document.getElementById('activityCard').style.display = 'none';
                    document.getElementById('favoritesCard').style.display = 'none';
                    document.getElementById('recommendationsCard').style.display = 'none';
                    document.getElementById('dataCard').style.display = 'none';
                }
            }

            switchTab(tabName) {
                // Update active tab
                document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
                document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

                // Show/hide tab content
                document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
                document.getElementById(`${tabName}Tab`).classList.remove('hidden');
            }

            async searchBeatmaps() {
                const query = document.getElementById('searchInput').value.trim();
                if (!query) return;

                const resultsDiv = document.getElementById('searchResults');
                resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';

                try {
                    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`);
                    const data = await response.json();

                    if (!response.ok) throw new Error(data.error);

                    if (data.results.length === 0) {
                        resultsDiv.innerHTML = '<div class="error">No results found</div>';
                        return;
                    }

                    resultsDiv.innerHTML = data.results.map(beatmapset => `
                        <div class="result-item" onclick="dashboard.getBeatmapInfo(${beatmapset.difficulties[0].id})">
                            <img class="result-cover" src="${beatmapset.urls.cover}" alt="Cover">
                            <div class="result-info">
                                <div class="result-title">${beatmapset.title}</div>
                                <div class="result-meta">
                                    by ${beatmapset.creator} • ${beatmapset.difficulties.length} difficulties
                                    • ★${Math.min(...beatmapset.difficulties.map(d => d.stars))}-${Math.max(...beatmapset.difficulties.map(d => d.stars))}
                                </div>
                            </div>
                            <div style="text-align: right; display: flex; align-items: center; gap: 0.5rem;">
                                <button class="favorite-btn ${this.favorites.includes(beatmapset.id) ? 'favorited' : ''}" 
                                        onclick="event.stopPropagation(); dashboard.toggleFavorite(${beatmapset.id})" 
                                        title="Add to favorites">
                                    ${this.favorites.includes(beatmapset.id) ? '❤️' : '🤍'}
                                </button>
                                <div>
                                    <div style="font-size: 0.9rem; color: #64748b;">
                                        ${beatmapset.play_count?.toLocaleString() || 0} plays
                                    </div>
                                    <div style="font-size: 0.8rem; color: #64748b;">
                                        ❤️ ${beatmapset.favourite_count?.toLocaleString() || 0}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('');
                } catch (error) {
                    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
                }
            }

            async getBeatmapInfo(beatmapId = null) {
                const id = beatmapId || document.getElementById('beatmapInput').value.trim();
                if (!id) return;

                const resultsDiv = document.getElementById('beatmapResults');
                resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Loading beatmap info...</div>';

                try {
                    const response = await fetch(`/api/beatmap/${id}`);
                    const beatmap = await response.json();

                    if (!response.ok) throw new Error(beatmap.error);

                    resultsDiv.innerHTML = `
                        <div class="beatmap-details">
                            <img class="beatmap-cover" src="${beatmap.urls.cover_2x}" alt="Cover">
                            <div>
                                <h3>${beatmap.title}</h3>
                                <p><strong>[${beatmap.version}]</strong> by ${beatmap.creator}</p>
                                <p class="difficulty-stars">★ ${beatmap.stars}</p>
                                <div class="stats-grid" style="margin-top: 1rem;">
                                    <div class="stat-item">
                                        <div class="stat-value">${beatmap.stats.cs}</div>
                                        <div class="stat-label">CS</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${beatmap.stats.ar}</div>
                                        <div class="stat-label">AR</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${beatmap.stats.od}</div>
                                        <div class="stat-label">OD</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${beatmap.bpm}</div>
                                        <div class="stat-label">BPM</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${beatmap.length.formatted}</div>
                                        <div class="stat-label">Length</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${beatmap.max_combo}x</div>
                                        <div class="stat-label">Max Combo</div>
                                    </div>
                                </div>
                                <div style="margin-top: 1rem;">
                                    <a href="${beatmap.urls.beatmap}" target="_blank" class="btn btn-primary">View on osu!</a>
                                    ${beatmap.urls.preview ? `<button onclick="dashboard.playPreview('${beatmap.urls.preview}')" class="btn btn-secondary">Preview</button>` : ''}
                                </div>
                            </div>
                        </div>
                    `;

                    // Switch to beatmap tab if called from search
                    if (beatmapId) {
                        this.switchTab('beatmap');
                        document.getElementById('beatmapInput').value = id;
                    }
                } catch (error) {
                    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
                }
            }

            async getUserScores() {
                const username = document.getElementById('userInput').value.trim();
                const scoreType = document.getElementById('scoreType').value;
                if (!username) return;

                const resultsDiv = document.getElementById('leaderboardResults');
                resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Loading user scores...</div>';

                try {
                    const response = await fetch(`/api/user/${encodeURIComponent(username)}/leaderboards?type=${scoreType}&limit=20`);
                    const data = await response.json();

                    if (!response.ok) throw new Error(data.error);

                    if (data.scores.length === 0) {
                        resultsDiv.innerHTML = '<div class="error">No scores found</div>';
                        return;
                    }

                    resultsDiv.innerHTML = `
                        <div style="margin-bottom: 1rem; padding: 1rem; background: #f8fafc; border-radius: 12px;">
                            <strong>${data.user.username}</strong> 
                            (${data.user.country}) 
                            - Global Rank: #${data.user.global_rank?.toLocaleString() || 'Unranked'}
                            - ${Math.round(data.user.pp)}pp
                        </div>
                        ${data.scores.map((score, index) => `
                            <div class="score-item">
                                <div>
                                    <div style="font-weight: 600;">${score.beatmap.title}</div>
                                    <div style="font-size: 0.9rem; color: #64748b;">
                                        ★${score.beatmap.stars} • ${score.accuracy} • ${score.score}
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div class="score-rank">${score.rank}</div>
                                    <div style="font-size: 0.9rem;">
                                        ${score.pp}pp
                                        ${score.mods !== 'None' ? `<span class="mods">${score.mods}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    `;
                } catch (error) {
                    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
                }
            }

            async loadUserProfile() {
                if (!this.currentUser) return;

                const profileDiv = document.getElementById('profileContent');
                profileDiv.innerHTML = `
                    <div style="text-align: center; margin-bottom: 1rem;">
                        <img src="${this.currentUser.avatar_url}" alt="Avatar" style="width: 80px; height: 80px; border-radius: 50%; margin-bottom: 1rem;">
                        <h3>${this.currentUser.username}</h3>
                        <p>${this.currentUser.country.name} • Joined ${new Date(this.currentUser.join_date).getFullYear()}</p>
                    </div>
                `;

                const statsDiv = document.getElementById('statsContent');
                const stats = this.currentUser.statistics;
                statsDiv.innerHTML = `
                    <div class="stat-item">
                        <div class="stat-value">#${stats.global_rank?.toLocaleString() || '—'}</div>
                        <div class="stat-label">Global Rank</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${Math.round(stats.pp || 0).toLocaleString()}</div>
                        <div class="stat-label">PP</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.accuracy?.toFixed(2) || 0}%</div>
                        <div class="stat-label">Accuracy</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.play_count?.toLocaleString() || 0}</div>
                        <div class="stat-label">Play Count</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${Math.floor((stats.play_time || 0) / 3600).toLocaleString()}h</div>
                        <div class="stat-label">Play Time</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">Lv.${Math.floor(stats.level?.current || 0)}</div>
                        <div class="stat-label">Level</div>
                    </div>
                `;
            }

            playPreview(url) {
                // Stop any currently playing audio
                const existingAudio = document.getElementById('previewAudio');
                if (existingAudio) {
                    existingAudio.pause();
                    existingAudio.remove();
                }

                // Create and play new audio
                const audio = document.createElement('audio');
                audio.id = 'previewAudio';
                audio.src = url;
                audio.volume = 0.5;
                audio.play().catch(e => {
                    this.showNotification('Could not play preview', 'error');
                });

                // Auto-stop after 30 seconds
                setTimeout(() => {
                    if (audio) {
                        audio.pause();
                        audio.remove();
                    }
                }, 30000);
            }

            async logout() {
                try {
                    await fetch('/logout', { method: 'POST' });
                    this.currentUser = null;
                    this.updateUserInterface();
                    this.showNotification('Logged out successfully', 'success');
                } catch (error) {
                    this.showNotification('Logout failed', 'error');
                }
            }

            async compareUsers() {
                const user1 = document.getElementById('compareUser1').value.trim();
                const user2 = document.getElementById('compareUser2').value.trim();
                
                if (!user1 || !user2) {
                    this.showNotification('Please enter both usernames', 'error');
                    return;
                }

                const resultsDiv = document.getElementById('comparisonResults');
                resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Comparing players...</div>';

                try {
                    const [scores1, scores2] = await Promise.all([
                        fetch(`/api/user/${encodeURIComponent(user1)}/leaderboards?type=best&limit=50`),
                        fetch(`/api/user/${encodeURIComponent(user2)}/leaderboards?type=best&limit=50`)
                    ]);

                    const [data1, data2] = await Promise.all([scores1.json(), scores2.json()]);

                    if (!scores1.ok) throw new Error(`User 1: ${data1.error}`);
                    if (!scores2.ok) throw new Error(`User 2: ${data2.error}`);

                    resultsDiv.innerHTML = `
                        <div class="comparison-grid">
                            <div class="player-card">
                                <h3>${data1.user.username}</h3>
                                <div class="stats-grid">
                                    <div class="stat-item">
                                        <div class="stat-value">#${data1.user.global_rank?.toLocaleString() || '—'}</div>
                                        <div class="stat-label">Global Rank</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${Math.round(data1.user.pp)}</div>
                                        <div class="stat-label">PP</div>
                                    </div>
                                </div>
                            </div>
                            <div class="vs-divider">VS</div>
                            <div class="player-card">
                                <h3>${data2.user.username}</h3>
                                <div class="stats-grid">
                                    <div class="stat-item">
                                        <div class="stat-value">#${data2.user.global_rank?.toLocaleString() || '—'}</div>
                                        <div class="stat-label">Global Rank</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${Math.round(data2.user.pp)}</div>
                                        <div class="stat-label">PP</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 1rem;">
                            <h4>Head-to-Head Analysis</h4>
                            <div style="margin-top: 0.5rem; padding: 1rem; background: #f8fafc; border-radius: 8px;">
                                <div>PP Difference: <strong>${Math.abs(data1.user.pp - data2.user.pp).toFixed(0)}pp</strong></div>
                                <div>Rank Difference: <strong>${Math.abs((data1.user.global_rank || 0) - (data2.user.global_rank || 0)).toLocaleString()}</strong></div>
                                <div>Better Player: <strong>${data1.user.pp > data2.user.pp ? data1.user.username : data2.user.username}</strong></div>
                            </div>
                        </div>
                    `;
                } catch (error) {
                    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
                }
            }

            async loadRecentActivity() {
                if (!this.currentUser) return;

                try {
                    const response = await fetch(`/api/user/${this.currentUser.username}/leaderboards?type=recent&limit=10`);
                    const data = await response.json();

                    if (response.ok && data.scores.length > 0) {
                        document.getElementById('recentActivity').innerHTML = data.scores.slice(0, 5).map(score => `
                            <div class="activity-item">
                                <div class="activity-time">${this.timeAgo(score.created_at)}</div>
                                <div>
                                    <div style="font-weight: 600;">${score.beatmap.title}</div>
                                    <div style="font-size: 0.9rem; color: #64748b;">
                                        ${score.rank} • ${score.accuracy} • ${score.pp}pp
                                    </div>
                                </div>
                            </div>
                        `).join('');
                    }
                } catch (error) {
                    console.error('Failed to load recent activity:', error);
                }
            }

            async loadMoreActivity() {
                // Implementation for pagination
                this.activityPage++;
                // Load more activity items...
            }

            toggleFavorite(beatmapsetId) {
                const index = this.favorites.indexOf(beatmapsetId);
                if (index > -1) {
                    this.favorites.splice(index, 1);
                    this.showNotification('Removed from favorites', 'success');
                } else {
                    this.favorites.push(beatmapsetId);
                    this.showNotification('Added to favorites', 'success');
                }
                localStorage.setItem('osu_favorites', JSON.stringify(this.favorites));
                
                // Update favorites display if visible
                if (document.getElementById('favoritesCard').style.display !== 'none') {
                    this.loadFavorites();
                }
                
                // Re-render search results to update heart icons
                if (document.getElementById('searchResults').children.length > 0) {
                    this.searchBeatmaps();
                }
            }

            loadChart() {
                const canvas = document.getElementById('performanceChart');
                if (!canvas) return;
                
                // Destroy existing chart
                if (this.chart && this.chart.destroy) {
                    this.chart.destroy();
                }
                
                const ctx = canvas.getContext('2d');
                
                this.chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Performance',
                            data: [],
                            borderColor: '#667eea',
                            backgroundColor: 'rgba(102, 126, 234, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: false,
                                grid: {
                                    color: 'rgba(0,0,0,0.1)'
                                }
                            },
                            x: {
                                grid: {
                                    color: 'rgba(0,0,0,0.1)'
                                }
                            }
                        }
                    }
                });
                
                this.updateChart('pp');
            }

            async updateChart(type) {
                if (!this.currentUser || !this.chart) return;

                try {
                    const response = await fetch(`/api/user/${this.currentUser.username}/leaderboards?type=best&limit=50`);
                    const data = await response.json();

                    if (response.ok) {
                        const chartData = data.scores.slice(0, 20).reverse(); // Show top 20, reverse for chronological order
                        
                        this.chart.data.labels = chartData.map((_, index) => `Top ${index + 1}`);
                        this.chart.data.datasets[0].data = chartData.map(score => {
                            switch(type) {
                                case 'pp': return score.pp;
                                case 'accuracy': return parseFloat(score.accuracy);
                                case 'stars': return score.beatmap.stars;
                                default: return score.pp;
                            }
                        });
                        
                        this.chart.data.datasets[0].label = type.toUpperCase();
                        this.chart.update();
                    }
                } catch (error) {
                    console.error('Failed to load chart data:', error);
                }
            }

            async calculateDifficulty() {
                const beatmapId = document.getElementById('calcBeatmapId').value.trim();
                const mods = document.getElementById('calcMods').value;
                
                if (!beatmapId) {
                    this.showNotification('Please enter a beatmap ID', 'error');
                    return;
                }

                const resultsDiv = document.getElementById('calculatorResults');
                resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Calculating...</div>';

                try {
                    const response = await fetch(`/api/beatmap/${beatmapId}`);
                    const beatmap = await response.json();

                    if (!response.ok) throw new Error(beatmap.error);

                    // Calculate modified stats based on mods
                    const modifiedStats = this.calculateModEffects(beatmap, mods);

                    resultsDiv.innerHTML = `
                        <div class="calculator-result">
                            <h4>${beatmap.title} [${beatmap.version}]</h4>
                            <div style="margin: 1rem 0;">
                                ${mods ? `<span class="mod-effect">${mods}</span>` : '<span class="mod-effect">No Mods</span>'}
                            </div>
                            <div class="stats-grid">
                                <div class="stat-item">
                                    <div class="stat-value">${modifiedStats.stars.toFixed(2)}★</div>
                                    <div class="stat-label">Difficulty</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${modifiedStats.ar.toFixed(1)}</div>
                                    <div class="stat-label">AR</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${modifiedStats.od.toFixed(1)}</div>
                                    <div class="stat-label">OD</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${modifiedStats.cs.toFixed(1)}</div>
                                    <div class="stat-label">CS</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${modifiedStats.bpm}</div>
                                    <div class="stat-label">BPM</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${modifiedStats.length}</div>
                                    <div class="stat-label">Length</div>
                                </div>
                            </div>
                            <div style="margin-top: 1rem; padding: 1rem; background: #e2e8f0; border-radius: 8px;">
                                <strong>Estimated PP for 95% accuracy:</strong> ${this.estimatePP(modifiedStats.stars, 95, mods)}pp<br>
                                <strong>Estimated PP for 98% accuracy:</strong> ${this.estimatePP(modifiedStats.stars, 98, mods)}pp<br>
                                <strong>Estimated PP for 100% accuracy:</strong> ${this.estimatePP(modifiedStats.stars, 100, mods)}pp
                            </div>
                        </div>
                    `;
                } catch (error) {
                    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
                }
            }

            calculateModEffects(beatmap, mods) {
                let modifiedStats = {
                    stars: beatmap.stars,
                    ar: beatmap.stats.ar,
                    od: beatmap.stats.od,
                    cs: beatmap.stats.cs,
                    bpm: beatmap.bpm,
                    length: beatmap.length.formatted
                };

                if (mods.includes('HR')) {
                    modifiedStats.ar = Math.min(10, modifiedStats.ar * 1.4);
                    modifiedStats.od = Math.min(10, modifiedStats.od * 1.4);
                    modifiedStats.cs = Math.min(10, modifiedStats.cs * 1.3);
                    modifiedStats.stars *= 1.12;
                }

                if (mods.includes('EZ')) {
                    modifiedStats.ar *= 0.5;
                    modifiedStats.od *= 0.5;
                    modifiedStats.cs *= 0.5;
                    modifiedStats.stars *= 0.5;
                }

                if (mods.includes('DT')) {
                    modifiedStats.bpm = Math.round(modifiedStats.bpm * 1.5);
                    modifiedStats.ar = Math.min(10, modifiedStats.ar * 1.4);
                    modifiedStats.od = Math.min(10, modifiedStats.od * 1.4);
                    modifiedStats.stars *= 1.18;
                    // Recalculate length
                    const originalSeconds = beatmap.length.total;
                    const newSeconds = Math.round(originalSeconds / 1.5);
                    modifiedStats.length = this.formatSeconds(newSeconds);
                }

                if (mods.includes('HT')) {
                    modifiedStats.bpm = Math.round(modifiedStats.bpm * 0.75);
                    modifiedStats.ar *= 0.67;
                    modifiedStats.od *= 0.67;
                    modifiedStats.stars *= 0.7;
                    const originalSeconds = beatmap.length.total;
                    const newSeconds = Math.round(originalSeconds / 0.75);
                    modifiedStats.length = this.formatSeconds(newSeconds);
                }

                return modifiedStats;
            }

            formatSeconds(seconds) {
                if (!seconds || seconds < 0) return '0:00';
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            }

            estimatePP(stars, accuracy, mods) {
                let pp = Math.pow(stars, 2.2) * Math.pow(accuracy / 100, 5.8) * 42;
                
                if (mods.includes('HD')) pp *= 1.06;
                if (mods.includes('HR')) pp *= 1.12;
                if (mods.includes('DT')) pp *= 1.18;
                if (mods.includes('FL')) pp *= 1.12;
                if (mods.includes('EZ')) pp *= 0.5;
                if (mods.includes('HT')) pp *= 0.3;
                
                return Math.round(pp);
            }

            async loadFavorites() {
                if (this.favorites.length === 0) {
                    document.getElementById('favoritesContent').innerHTML = '<div style="text-align: center; padding: 2rem; color: #64748b;">No favorites yet. Heart some beatmaps to see them here!</div>';
                    return;
                }

                const content = document.getElementById('favoritesContent');
                content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading favorites...</div>';

                try {
                    const favoritePromises = this.favorites.slice(0, 10).map(async (id) => {
                        try {
                            const response = await fetch(`/api/search?q=id:${id}&limit=1`);
                            return response.ok ? await response.json() : null;
                        } catch {
                            return null;
                        }
                    });

                    const results = await Promise.all(favoritePromises);
                    const validFavorites = results.filter(result => result && result.results.length > 0);

                    if (validFavorites.length === 0) {
                        content.innerHTML = '<div style="text-align: center; color: #64748b;">No valid favorites found.</div>';
                        return;
                    }

                    content.innerHTML = validFavorites.map(result => {
                        const beatmapset = result.results[0];
                        return `
                            <div class="result-item" onclick="dashboard.getBeatmapInfo(${beatmapset.difficulties[0].id})">
                                <img class="result-cover" src="${beatmapset.urls.cover}" alt="Cover">
                                <div class="result-info">
                                    <div class="result-title">${beatmapset.title}</div>
                                    <div class="result-meta">by ${beatmapset.creator}</div>
                                </div>
                                <button class="favorite-btn favorited" 
                                        onclick="event.stopPropagation(); dashboard.toggleFavorite(${beatmapset.id})" 
                                        title="Remove from favorites">❤️</button>
                            </div>
                        `;
                    }).join('');
                } catch (error) {
                    content.innerHTML = '<div class="error">Failed to load favorites</div>';
                }
            }

            async loadRecommendations(type) {
                if (!this.currentUser) return;

                // Update active tab
                document.querySelectorAll('[data-rec]').forEach(tab => tab.classList.remove('active'));
                document.querySelector(`[data-rec="${type}"]`).classList.add('active');

                const content = document.getElementById('recommendationsContent');
                content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading recommendations...</div>';

                try {
                    const response = await fetch(`/api/user/${this.currentUser.username}/leaderboards?type=best&limit=20`);
                    const data = await response.json();

                    if (!response.ok) throw new Error(data.error);

                    const recommendations = this.generateRecommendations(data.scores, type);
                    
                    content.innerHTML = recommendations.map(rec => `
                        <div class="recommendation-item" onclick="dashboard.getBeatmapInfo(${rec.beatmap_id})">
                            <div class="result-info">
                                <div class="result-title">${rec.title}</div>
                                <div class="result-meta">★${rec.stars} • ${rec.reason}</div>
                            </div>
                            <span class="recommendation-reason">${rec.type}</span>
                        </div>
                    `).join('');
                } catch (error) {
                    content.innerHTML = '<div class="error">Failed to load recommendations</div>';
                }
            }

            generateRecommendations(scores, type) {
                const avgStars = scores.reduce((sum, score) => sum + score.beatmap.stars, 0) / scores.length;
                const avgAcc = scores.reduce((sum, score) => sum + parseFloat(score.accuracy), 0) / scores.length;

                const recommendations = [];

                switch(type) {
                    case 'skill':
                        // Recommend slightly harder maps
                        recommendations.push({
                            title: `Maps around ${(avgStars + 0.5).toFixed(1)}★`,
                            stars: avgStars + 0.5,
                            reason: 'Slightly above your comfort zone',
                            type: 'Skill',
                            beatmap_id: scores[0].beatmap.id // Placeholder
                        });
                        break;
                    
                    case 'pp':
                        // Recommend farm maps
                        recommendations.push({
                            title: `Jump training maps ${avgStars.toFixed(1)}★`,
                            stars: avgStars,
                            reason: 'Good for PP farming',
                            type: 'PP Farm',
                            beatmap_id: scores[0].beatmap.id
                        });
                        break;
                    
                    case 'accuracy':
                        // Recommend technical maps
                        recommendations.push({
                            title: `Technical maps ${(avgStars - 0.3).toFixed(1)}★`,
                            stars: avgStars - 0.3,
                            reason: 'Focus on accuracy improvement',
                            type: 'Accuracy',
                            beatmap_id: scores[0].beatmap.id
                        });
                        break;
                }

                return recommendations;
            }

            toggleTheme() {
                this.isDarkMode = !this.isDarkMode;
                localStorage.setItem('darkMode', this.isDarkMode);
                this.applyTheme();
            }

            applyTheme() {
                if (this.isDarkMode) {
                    document.body.classList.add('dark-theme');
                    document.getElementById('themeToggle').textContent = '☀️';
                } else {
                    document.body.classList.remove('dark-theme');
                    document.getElementById('themeToggle').textContent = '🌙';
                }
            }

            setupRangeSliders() {
                const sliders = [
                    { id: 'starMin', display: 'starMinValue', suffix: '★' },
                    { id: 'starMax', display: 'starMaxValue', suffix: '★' },
                    { id: 'bpmMin', display: 'bpmMinValue', suffix: '' },
                    { id: 'bpmMax', display: 'bpmMaxValue', suffix: '' },
                    { id: 'lengthMin', display: 'lengthMinValue', suffix: '', format: 'time' },
                    { id: 'lengthMax', display: 'lengthMaxValue', suffix: '', format: 'time' }
                ];

                sliders.forEach(slider => {
                    const element = document.getElementById(slider.id);
                    const display = document.getElementById(slider.display);
                    
                    element.addEventListener('input', () => {
                        const value = parseFloat(element.value);
                        if (slider.format === 'time') {
                            const minutes = Math.floor(value);
                            const seconds = Math.round((value - minutes) * 60);
                            display.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                        } else {
                            display.textContent = value + slider.suffix;
                        }
                    });
                    
                    // Trigger initial display
                    element.dispatchEvent(new Event('input'));
                });
            }

            async advancedSearch() {
                const query = document.getElementById('advancedSearchInput').value.trim();
                const filters = {
                    starMin: document.getElementById('starMin').value,
                    starMax: document.getElementById('starMax').value,
                    bpmMin: document.getElementById('bpmMin').value,
                    bpmMax: document.getElementById('bpmMax').value,
                    lengthMin: document.getElementById('lengthMin').value,
                    lengthMax: document.getElementById('lengthMax').value,
                    status: document.getElementById('statusFilter').value
                };

                if (!query && !Object.values(filters).some(v => v)) {
                    this.showNotification('Please enter a search query or set filters', 'error');
                    return;
                }

                const resultsDiv = document.getElementById('advancedSearchResults');
                resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Advanced searching...</div>';

                try {
                    // Build search query with filters
                    let searchQuery = query;
                    if (filters.status) searchQuery += ` status=${filters.status}`;

                    const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=20`);
                    const data = await response.json();

                    if (!response.ok) throw new Error(data.error);

                    // Client-side filtering (since API might not support all filters)
                    const filteredResults = data.results.filter(beatmapset => {
                        const minStar = Math.min(...beatmapset.difficulties.map(d => d.stars));
                        const maxStar = Math.max(...beatmapset.difficulties.map(d => d.stars));
                        
                        return minStar >= filters.starMin && 
                               maxStar <= filters.starMax &&
                               beatmapset.bpm >= filters.bpmMin &&
                               beatmapset.bpm <= filters.bpmMax;
                    });

                    if (filteredResults.length === 0) {
                        resultsDiv.innerHTML = '<div class="error">No results match your filters</div>';
                        return;
                    }

                    resultsDiv.innerHTML = filteredResults.map(beatmapset => `
                        <div class="result-item" onclick="dashboard.getBeatmapInfo(${beatmapset.difficulties[0].id})">
                            <img class="result-cover" src="${beatmapset.urls.cover}" alt="Cover">
                            <div class="result-info">
                                <div class="result-title">${beatmapset.title}</div>
                                <div class="result-meta">
                                    by ${beatmapset.creator} • ${beatmapset.bpm} BPM
                                    • ★${Math.min(...beatmapset.difficulties.map(d => d.stars))}-${Math.max(...beatmapset.difficulties.map(d => d.stars))}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div class="difficulty-stars">Matches filters</div>
                            </div>
                        </div>
                    `).join('');

                } catch (error) {
                    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
                }
            }

            resetFilters() {
                document.getElementById('starMin').value = 0;
                document.getElementById('starMax').value = 10;
                document.getElementById('bpmMin').value = 60;
                document.getElementById('bpmMax').value = 300;
                document.getElementById('lengthMin').value = 0;
                document.getElementById('lengthMax').value = 10;
                document.getElementById('statusFilter').value = '';
                
                // Trigger updates
                document.querySelectorAll('.range-slider').forEach(slider => {
                    slider.dispatchEvent(new Event('input'));
                });
                
                this.showNotification('Filters reset', 'success');
            }

            async exportData(type) {
                try {
                    let data = {};
                    let filename = '';

                    switch(type) {
                        case 'favorites':
                            data = { favorites: this.favorites, exportDate: new Date().toISOString() };
                            filename = 'osu_favorites.json';
                            break;
                        case 'scores':
                            if (!this.currentUser) throw new Error('Login required');
                            const response = await fetch(`/api/user/${this.currentUser.username}/leaderboards?type=best&limit=100`);
                            data = await response.json();
                            data.exportDate = new Date().toISOString();
                            filename = `osu_scores_${this.currentUser.username}.json`;
                            break;
                        case 'stats':
                            if (!this.currentUser) throw new Error('Login required');
                            data = { user: this.currentUser, exportDate: new Date().toISOString() };
                            filename = `osu_stats_${this.currentUser.username}.json`;
                            break;
                    }

                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);

                    this.showNotification(`${type} exported successfully`, 'success');
                } catch (error) {
                    this.showNotification(`Export failed: ${error.message}`, 'error');
                }
            }

            async importData(event) {
                const file = event.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    if (data.favorites) {
                        this.favorites = [...new Set([...this.favorites, ...data.favorites])];
                        localStorage.setItem('osu_favorites', JSON.stringify(this.favorites));
                        this.loadFavorites();
                        this.showNotification('Favorites imported successfully', 'success');
                    } else {
                        this.showNotification('Invalid import file', 'error');
                    }
                } catch (error) {
                    this.showNotification('Import failed: Invalid file', 'error');
                }
            }

            toggleQuickMenu() {
                const menu = document.getElementById('quickActionMenu');
                menu.classList.toggle('hidden');
            }

            async quickSearch() {
                const query = prompt('Quick search:');
                if (query) {
                    document.getElementById('searchInput').value = query;
                    this.switchTab('search');
                    this.searchBeatmaps();
                }
                this.toggleQuickMenu();
            }

            async randomBeatmap() {
                this.showNotification('Finding random beatmap...', 'info');
                try {
                    const queries = ['jump', 'stream', 'tech', 'farm', 'old', 'new'];
                    const randomQuery = queries[Math.floor(Math.random() * queries.length)];
                    
                    const response = await fetch(`/api/search?q=${randomQuery}&limit=50`);
                    const data = await response.json();
                    
                    if (data.results.length > 0) {
                        const randomBeatmapset = data.results[Math.floor(Math.random() * data.results.length)];
                        const randomDiff = randomBeatmapset.difficulties[Math.floor(Math.random() * randomBeatmapset.difficulties.length)];
                        this.getBeatmapInfo(randomDiff.id);
                        this.showNotification('Random beatmap found!', 'success');
                    }
                } catch (error) {
                    this.showNotification('Failed to find random beatmap', 'error');
                }
                this.toggleQuickMenu();
            }

            async todaysRecommendation() {
                if (!this.currentUser) {
                    this.showNotification('Login required for recommendations', 'error');
                    this.toggleQuickMenu();
                    return;
                }
                
                this.showNotification('Generating today\'s recommendation...', 'info');
                this.loadRecommendations('skill');
                this.toggleQuickMenu();
            }

            showStats() {
                if (this.currentUser) {
                    const statsModal = `
                        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2000; display: flex; align-items: center; justify-content: center;" onclick="this.remove()">
                            <div class="card" style="max-width: 400px; margin: 0;" onclick="event.stopPropagation()">
                                <h3>Quick Stats</h3>
                                <div class="stats-grid">
                                    <div class="stat-item">
                                        <div class="stat-value">#${this.currentUser.statistics.global_rank?.toLocaleString() || '—'}</div>
                                        <div class="stat-label">Rank</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${Math.round(this.currentUser.statistics.pp).toLocaleString()}</div>
                                        <div class="stat-label">PP</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${this.currentUser.statistics.accuracy?.toFixed(2)}%</div>
                                        <div class="stat-label">Accuracy</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value">${this.currentUser.statistics.play_count?.toLocaleString()}</div>
                                        <div class="stat-label">Plays</div>
                                    </div>
                                </div>
                                <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;" onclick="this.parentElement.parentElement.remove()">Close</button>
                            </div>
                        </div>
                    `;
                    document.body.insertAdjacentHTML('beforeend', statsModal);
                } else {
                    this.showNotification('Login required to view stats', 'error');
                }
                this.toggleQuickMenu();
            }80);

                    if (index === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });

                ctx.stroke();

                // Add labels
                ctx.fillStyle = '#64748b';
                ctx.font = '12px sans-serif';
                ctx.fillText(`${type.toUpperCase()}: ${minY.toFixed(0)} - ${maxY.toFixed(0)}`, 10, 15);
            }

            timeAgo(dateString) {
                const now = new Date();
                const past = new Date(dateString);
                const diffMs = now - past;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMins / 60);
                const diffDays = Math.floor(diffHours / 24);

                if (diffMins < 1) return 'now';
                if (diffMins < 60) return `${diffMins}m`;
                if (diffHours < 24) return `${diffHours}h`;
                return `${diffDays}d`;
            }

            showNotification(message, type = 'info') {
                const notification = document.createElement('div');
                notification.className = `notification ${type}`;
                notification.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>${message}</span>
                        <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">×</button>
                    </div>
                `;

                document.body.appendChild(notification);

                // Show notification
                setTimeout(() => notification.classList.add('show'), 100);

                // Auto-remove after 5 seconds
                setTimeout(() => {
                    notification.classList.remove('show');
                    setTimeout(() => notification.remove(), 300);
                }, 5000);
            }
        }

        // Initialize dashboard
        const dashboard = new OsuDashboard();
    </script>