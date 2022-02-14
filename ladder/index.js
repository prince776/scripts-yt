const axios = require('axios');
const { time } = require('console');
const fs = require('fs');
const { start } = require('repl');
const mongoose = require('mongoose');

const observationTime = 2 * 365 * 24 * 60 * 60;
const observationWindow = 6 * 31 * 24 * 60 * 60;
const improvementThreshold = 150;

const contestThreshold = 20;
const problemThreshold = 150;

const getEpochSecond = () => {
	return Math.floor(new Date().getTime() / 1000);
}

const getRating = async (handle) => {
	const response = await axios({
		method: 'get',
		url: `https://codeforces.com/api/user.rating?handle=${handle}`,
	});
	return response.data.result;
};

const getSubmissions = async (handle) => {
	const response = await axios({
		method: 'get',
		url: `https://codeforces.com/api/user.status?handle=${handle}`,
	});
	return response.data.result;
}

const getEligibleProblems = async (user) => {
	const { handle } = user;
	const now = getEpochSecond();
	const thresholdTime = now - observationTime;

	let rating = await getRating(handle);
	rating = rating.filter(r => r.ratingUpdateTimeSeconds >= thresholdTime);
	if (rating.length < contestThreshold) {
		return [];
	}

	let allSubmissions = await getSubmissions(handle);
	allSubmissions = allSubmissions.filter(s => s.creationTimeSeconds >= thresholdTime && s.verdict === 'OK');
	
	const problemIds = new Set();
	let submissions = [];
	for (const submission of allSubmissions) {
		const key = getProblemKey(submission.problem);
		if (problemIds.has(key)) {
			continue;
		}
		problemIds.add(key);
		submissions.push(submission);
	}

	if (submissions.length < problemThreshold) {
		return [];
	}

	let eligibleSubmissions = [];
	for (let start = thresholdTime; start < now; start += observationWindow) {
		const end = start + observationWindow;
		const ratingWindow = rating.filter(r => r.ratingUpdateTimeSeconds >= start && r.ratingUpdateTimeSeconds < end);
		if (!ratingWindow.length) {
			continue;
		}
		const startRating = ratingWindow[0].newRating;
		const maxRating = Math.max(...ratingWindow.map(r => r.newRating));
		if (maxRating - startRating >= improvementThreshold) {
			eligibleSubmissions = [ ...eligibleSubmissions,
				...submissions.filter(s => s.creationTimeSeconds >= start && s.creationTimeSeconds < end) ];
		}
	}
	const eligibleProblems = eligibleSubmissions.map(sub => sub.problem);
	// console.log(`${handle} has ${eligibleProblems.length} eligible problems`);
	return eligibleProblems;
}

const getProblemKey = (problem) => {
	return `${problem.contestId}:${problem.index}`;
}

const getEligibleProblemsInBatch = async (users, problemMap, problemFreq, errCount, start, end, skippedUsers) => {
	console.log(`Processing batch ${start} to ${end}`);
	const last = Math.min(end, users.length);
	for (let i = start; i < last; i++) {
		const user = users[i];
		try {
			const problems = await getEligibleProblems(user);
			for (const problem of problems) {
				const problemKey = getProblemKey(problem);
				if (!problemMap[problemKey]) {
					problemMap[problemKey] = problem;
					problemFreq[problemKey] = 0;
				}
				problemFreq[problemKey]++;
			}
		} catch (err) {
			// console.log(`Error for ${user.handle}: ${err}`);
			if (!errCount[i]) errCount[i] = 0;
			errCount[i]++;
			if (errCount[i] <= 6) {
				await new Promise(resolve => setTimeout(resolve, 3000));
				i--;
			} else {
				skippedUsers.push(user);
			}
		}
		await new Promise(resolve => setTimeout(resolve, 1000));
	}
	console.log(`Processed batch ${start} to ${end}`);
}

const getAllEligibleProblems = async (startFrom, doSkipped = false) => {
	const userFile = JSON.parse(fs.readFileSync('./cfusers.json'));
	let users = [...userFile.result];
	
	const errCount = {};
	let problemMap = {};
	let problemFreq = {};
	let skippedUsers = [];
	if (startFrom) {
		const checkpoint = JSON.parse(fs.readFileSync(`./checkpoints/checkpoint_${startFrom}.json`));
		problemMap = checkpoint.problemMap;
		problemFreq = checkpoint.problemFreq;
		skippedUsers = checkpoint.skippedUsers;
		if (doSkipped) {
			users = [...skippedUsers];
			skippedUsers = [];
		}
	} else {
		startFrom = 0;
	}

	console.log('Processing users:' + users.length);
	const checkPointSize = 100;
	const batchSize = 20;
	let start = startFrom;
	if (doSkipped) {
		start = 0;
	}
	for (let i = start; i < users.length; i += checkPointSize) {
		const toWrite = {
			problemMap: problemMap,
			problemFreq: problemFreq,
			skippedUsers: skippedUsers,
		};
		let checkpoint = startFrom + i;
		fs.writeFileSync(`./checkpoints/checkpoint_${checkpoint}.json`, JSON.stringify(toWrite));
		console.log(`Checkpoint upto ${checkpoint} written, skipped users: ${skippedUsers.length}, problems: ${Object.keys(problemMap).length}`);

		let tasks = [];
		for (let j = 0; j < checkPointSize; j += batchSize) {
			tasks.push(getEligibleProblemsInBatch(users, problemMap, problemFreq, errCount, i + j, i + j + batchSize, skippedUsers));
		}
		await Promise.allSettled(tasks);
	}
	const toWrite = {
		problemMap: problemMap,
		problemFreq: problemFreq,
		skippedUsers: skippedUsers,
	};
	fs.writeFileSync(`./checkpoints/checkpoint_${users.length}.json`, JSON.stringify(toWrite));
	console.log('Done');
}

// getAllEligibleProblems();
// getAllEligibleProblems(46014, true);

const data1 = JSON.parse(fs.readFileSync('./checkpoints/checkpoint_46014.json'));
const data2 = JSON.parse(fs.readFileSync('./checkpoints/checkpoint_48814.json'));

console.log(Object.keys(data1.problemMap).length);
console.log(Object.keys(data2.problemMap).length);

const fillDataInDB = async () => {
	const db = {
		user: process.env.DB_USER,
		pass: process.env.DB_PASS,
	}
	console.log(db);
	const problemSchema = new mongoose.Schema({
		constestId: String,
		index: String,
		name: String,
		tags: [String],
		rating: Number,
		frequency: Number,
	});
	const Problem = mongoose.model('Problem', problemSchema);

	await mongoose.connect(`mongodb+srv://${db.user}:${db.pass}@mongodb-cluster.5gkbu.mongodb.net/competitive-programming?retryWrites=true&w=majority`);
	
	const data = JSON.parse(fs.readFileSync('./problem-data.json'));
	const { problemMap, problemFreq } = data;
	const keys = Object.keys(problemMap);

	const batchSize = 100;
	console.log(`Filling ${keys.length} problems`);
	for (let i = 0; i < keys.length; i += batchSize) {

		let problems = [];
		const batch = keys.slice(i, i + batchSize);
		for (const key of batch) {
			const problemData = problemMap[key];
			let tags = [];
			if (Array.isArray(problemData.tags)) {
				tags = problemData.tags;
			}
			const problem = new Problem({
				contestId: problemData.contestId,
				index: problemData.index,
				name: problemData.name,
				tags: tags,
				rating: problemData.rating || 800,
				frequency: problemFreq[key] || 0,
			});
			problems.push(problem);
		}
		console.log(`Saving batch ${i} to ${i + batchSize}`);
		await Problem.insertMany(problems);
		console.log("Saved");
	}
	console.log("Done");
	await mongoose.disconnect();
}

// fillDataInDB();