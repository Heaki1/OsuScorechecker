document.getElementById("checkBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  console.log("Username entered:", username);
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Loading...";

  if (!username) {
    resultsDiv.innerHTML = "❌ Please enter a username.";
    return;
  }

  try {
    const res = await fetch(`https://osuscorechecker.onrender.com/api/leaderboard-scores?user=${encodeURIComponent(username)}`);
    const data = await res.json();

    if (!data || data.length === 0) {
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
