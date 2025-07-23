// Handles Top Scores Leaderboard (via "Check Leaderboard Scores" button)
document.getElementById("checkBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Loading...";

  if (!username) {
    resultsDiv.innerHTML = "❌ Please enter a username.";
    return;
  }

  try {
    const res = await fetch(`https://osuscorechecker.onrender.com/api/leaderboard-scores?user=${encodeURIComponent(username)}`);
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


// Handles Global Leaderboard Search (via "Check Global Leaderboard" button)
async function fetchGlobalLeaderboard() {
  const username = document.getElementById("usernameInput").value.trim();
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Loading...";

  if (!username) {
    alert("Please enter a username.");
    return;
  }

  try {
    const res = await fetch(`/api/global-leaderboard?user=${encodeURIComponent(username)}`);
    const data = await res.json();

    if (data.error) {
      resultsDiv.innerHTML = `<p style="color:red;">Error: ${data.error}</p>`;
      return;
    }

    if (data.length === 0) {
      resultsDiv.innerHTML = "<p>No global leaderboard scores found.</p>";
      return;
    }

    resultsDiv.innerHTML = `<h2>Found ${data.length} global leaderboard scores</h2>` +
      data.map(score => `
        <div class="result-card">
          <strong><a href="${score.beatmap.url}" target="_blank">${score.beatmap.title}</a></strong><br />
          Rank: #${score.rank}<br />
          Accuracy: ${score.accuracy}<br />
          Mods: ${score.mods}
        </div>
      `).join("");

  } catch (err) {
    resultsDiv.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    console.error(err);
  }
}
