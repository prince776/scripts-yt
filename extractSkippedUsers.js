const fs = require("fs");

const skippedUsers = [];

for (let idx = 0; idx < 9; idx++) {
  let data = fs.readFileSync(`./user_${idx}.json`);
  data = JSON.parse(data);

  skippedUsers.push(...data.skippedUsers);
}

fs.writeFileSync(
  "cfusers.json",
  JSON.stringify({
    problemMap: {},
    problemFreq: {},
    skippedUsers: skippedUsers,
  })
);
