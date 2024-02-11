const fs = require("fs");
const yahoo = require("./yahooFantasyBaseball");

const getData = async () => {
  try {
    // Read credentials file or get new authorization token
    await yahoo.yfbb.readCredentials();

    // If credentials exist
    if (yahoo.yfbb.CREDENTIALS) {
      console.log('Getting teams...')
      const teams = await yahoo.yfbb.getTeams();
      console.log(`Getting draft results...`);
      const draftResults = await yahoo.yfbb.getDraftResults();
      console.log(`Getting a list of transactions...`);
      const transactions = await yahoo.yfbb.getTransactions();

      const keepers = {}

      // Group by team key
      draftResults.draft_result.forEach((result) => {
        keepers[result.player_key] = { cost: Number(result.cost), ownerId: result.team_key }
      })

      // Oldest first
      transactions.transaction.reverse().forEach((transaction) => {
        // Player is not an array if count is 1
        const players = Array.isArray(transaction.players.player)
          ? transaction.players.player
          : [transaction.players.player]
        players.forEach((player) => {
          const keeper = keepers[player.player_key] ?? {}
          switch (player.transaction_data.type) {
            case 'add': {
              // Update cost to highest price paid
              keeper.cost = Math.max(keeper.cost ?? 0, transaction.faab_bid ?? 0)
              keeper.ownerId = player.transaction_data.destination_team_key
              break
            }
            case 'drop': {
              // Reset owner
              keeper.ownerId = undefined
              break
            }
            case 'trade': {
              keeper.ownerId = player.transaction_data.destination_team_key
            }
          }
          keepers[player.player_key] = keeper
        })
      })

      // Filter out any keepers without an owner (they were dropped)
      Object.keys(keepers).forEach((key) => {
        if (keepers[key].ownerId === undefined) {
          delete keepers[key]
        }
      })

      // Update keeper owner information
      Object.keys(keepers).forEach((key) => {
        const keeper = keepers[key]
        const team = teams.team.find((team) => team.team_key === keeper.ownerId)
        keeper.owner = team.name
      })

      console.log(`Getting players...`);
      const players = await yahoo.yfbb.getPlayers(Object.keys(keepers));

      // Add player data to keepers
      players.forEach((player) => {
        const keeper = keepers[player.player_key]
        keeper.name = player.name.full
        keeper.team = player.editorial_team_full_name
        keeper.positions = player.display_position
      })

      const finalKeepers = Object.fromEntries(Object.entries(keepers).sort((a, b) =>
        // Group by owner alphabetically
        a[1].owner.localeCompare(b[1].owner))
      )

      const data = JSON.stringify(finalKeepers);

      const outputFile = "./allMyData.json";

      // Writing to file
      fs.writeFile(outputFile, data, { flag: "w" }, (err) => {
        if (err) {
          console.error(`Error in writing to ${outputFile}: ${err}`);
        } else {
          console.error(`Data successfully written to ${outputFile}.`);
        }
      });
    }
  } catch (err) {
    console.error(`Error in getData(): ${err}`);
  }
};

getData();
