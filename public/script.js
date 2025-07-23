window.addEventListener("DOMContentLoaded", () => {
  // ✅ Global leaderboard button
  const leaderboardBtn = document.getElementById("checkLeaderboard");
  if (leaderboardBtn) {
    leaderboardBtn.addEventListener("click", fetchGlobalLeaderboard);
  }

  // ✅ Top scores leaderboard button
  const checkBtn = document.getElementById("checkBtn");
  if (checkBtn) {
    checkBtn.addEventListener("click", async () => {
      const username = document.getElementById("username").value.trim();
      const resultsDiv = document.getElementById("results");
      resultsDiv.innerHTML = "Loading...";

      if (!username) {
        resultsDiv.innerHTML = "❌ Please enter a username.";
        return;
      }

      try {
        const res = await fetch(`/api/leaderboard-scores?user=${encodeURIComponent(username)}`);
        const data = await res.json();

        if (!Array.isArray(data)) {
          console.error("Server error response:", data);
          resultsDiv.innerHTML = "❌ Server error: " + (data?.error || "Unknown error");
          return;
        }

        if (data.length === 0) {
          resultsDiv.innerHTML = "No leaderboard scores found.";
          return;
        }

        resultsDiv.innerHTML = data.map(item => `
          <div class="result-card">
            <strong><a href="${item.beatmap.url}" target="_blank">${item.beatmap.title}</a></strong><br />
            Rank: #${item.rank}<br />
            Score: ${item.score.toLocaleString()}<br />
            Accuracy: ${item.accuracy}<br />
            Mods: ${item.mods}
          </div>
        `).join("");
      } catch (err) {
        resultsDiv.innerHTML = "❌ Failed to load data.";
        console.error(err);
      }
    });
  }

  // ✅ Logged-in user info
  fetch("/api/me")
    .then(res => {
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    })
    .then(user => {
document.getElementById("userInfo").innerHTML = `
  🎉 Welcome, <strong>${user.username}</strong>!<br>
  <img src="${user.avatar_url}" width="100"><br>
  Global Rank: #${user.statistics.global_rank}<br>
  PP: ${user.statistics.pp.toFixed(2)}
`;
    })
    .catch(() => {
      document.getElementById("results").innerHTML = `
        <a href="/login" class="login-button">🔐 Login with osu!</a>
      `;
    });
});

