const fs = require("fs");

const completeData = {
  problemMap: {},
  problemFreq: {},
  skippedUsers: [],
};

for (let idx = 1; idx < 10; idx++) {
  let data = fs.readFileSync(`./user_${idx}.json`);
  data = JSON.parse(data);

  completeData.problemMap = {
    ...completeData.problemMap,
    ...data.problemMap,
  };

  let freqKeys = Object.keys(data.problemFreq);
  for (let i = 0; i < freqKeys.length; i++) {
    let key = freqKeys[i];
    completeData.problemFreq[key] =
      (completeData.problemFreq[key] || 0) + data.problemFreq[key];

    console.clear();
    console.log(`${idx}: ${(i / freqKeys.length) * 100}% complete`);
  }

  completeData.skippedUsers = [
    ...(completeData.skippedUsers || []),
    ...data.skippedUsers,
  ];
}

fs.writeFileSync("users.json", JSON.stringify(completeData));
