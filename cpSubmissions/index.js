const axios = require('axios');
const fs = require('fs');
// {
// 	problemName: 
// 	problemUrl:
//	submissionUrl:
//	platform:
//	timestamp:
// }

const getCFSubmissions = async () => {
	const response = await axios.get('https://codeforces.com/api/user.status?handle=codemastercpp&from=1&count=10000').catch(err => { throw err; });
  	const submissions = response.data.result;
	const acSubmissions = submissions.filter(submission => submission.verdict === 'OK');
  	const res = acSubmissions.map(submission => {
		return {
			problemName: submission.problem.name,
			problemUrl: `https://codeforces.com/problemset/problem/${submission.problem.contestId}/${submission.problem.index}`,
			submissionUrl: `https://codeforces.com/contest/${submission.problem.contestId}/submission/${submission.id}`,
			platform: 'codeforces',
			timestamp: submission.creationTimeSeconds,
		}
	});
	let finalRes = [];
	const done = new Set();
	for (const submission of res) {
		if (done.has(submission.problemName)) continue;
		done.add(submission.problemName);
		finalRes.push(submission);
	}
	return finalRes;
}

const getAtCoderSubmissions = async () => {
	const headers = {
		'accept-encoding': 'gzip',
	};
	const problemsRes = await axios({
		method: 'GET',
		headers: headers,
		url: 'https://kenkoooo.com/atcoder/resources/problems.json',
	}).catch(err => { throw err; });

	const problems = problemsRes.data;
	const problemIdNameMap = {};
	for (const problem of problems) {
		problemIdNameMap[problem.id] = problem.title;
	}

	let lastSecond = 0;
	let finalRes = [];
	while (true) {
		const submissionRes = await axios({
			method: 'GET',
			headers: headers,
			url: `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=codemastercpp&from_second=${lastSecond}`,
		}).catch(err => { throw err; });
		const submissions = submissionRes.data;
		if (submissions.length === 0) {
			break;
		}
		lastSecond = submissions[submissions.length - 1].epoch_second + 1;
		const acSubmissions = submissions.filter(submission => submission.result === 'AC');
		const res = acSubmissions.map(submission => {
			return {
				problemName: problemIdNameMap[submission.problem_id],
				problemUrl: `https://atcoder.jp/contests/${submission.contest_id}/tasks/${submission.problem_id}`,
				submissionUrl: `https://atcoder.jp/contests/${submission.contest_id}/submissions/${submission.id}`,
				platform: 'atcoder',
				timestamp: submission.epoch_second,
			}
		});
		finalRes = [...finalRes, ...res];
	}
	let finalResNoDup = [];
	const done = new Set();
	for (const submission of finalRes) {
		if (done.has(submission.problemName)) continue;
		done.add(submission.problemName);
		finalResNoDup.push(submission);
	}
	return finalResNoDup;
}

const getCCSubmissions = async (lastAfter = '') => {
	const headers = {
		'Authorization': `Bearer ${process.env.CC_TOKEN}`,
	}
	let after = lastAfter;
	let finalRes = [];
	if (lastAfter) {
		finalRes = JSON.parse(fs.readFileSync(`cc/resumeFrom_${lastAfter}.json`));
	}
	console.log("Initial length: ", finalRes.length);
	while (true) {
		let url = `https://api.codechef.com/submissions?username=codemastercpp&result=AC&limit=20`;
		if (after) {
			url += `&after=${after}`;
		}
		const response = await axios({
			method: 'GET',
			headers: headers,
			url: url,
		}).catch(err => {
			throw { err: err, tryAgainFrom: after}; 
		});
		const submissions = response.data.result.data.content;
		console.log(submissions);
		if (!submissions || submissions.length === 0) {
			break;
		}
		after = submissions[submissions.length - 1].id;
		const done = new Set();
		const res = submissions.map(submission => {
			if (done.has(submission.problemCode)) {
				return null;
			}
			done.add(submission.problemCode);
			return {
				problemName: submission.problemCode,
				problemUrl: `https://www.codechef.com/${submission.contestCode}/problems/${submission.problemCode}`,
				submissionUrl: `https://www.codechef.com/viewsolution/${submission.id}`,
				platform: 'codechef',
				timestamp: Date.parse(submission.date) / 1000,
			}
		});
		finalRes = [...finalRes, ...(res.filter(submission => submission !== null))];
		fs.writeFileSync(`cc/resumeFrom_${after}.json`, JSON.stringify(finalRes));
		await new Promise(resolve => setTimeout(resolve, 15 * 1000));
	}
	return finalRes;
}

const getCCSubmissionsFromFile = async () => {
	const submissions = JSON.parse(fs.readFileSync('cc.json'));
	let finalRes = [];
	const done = new Set();
	for (const submission of submissions) {
		if (done.has(submission.problemName)) {
			continue;
		}
		done.add(submission.problemName);
		finalRes.push(submission);
	}
	return submissions;
}

const controller = async () => {
	let submissions = [];

	try {
		const cfSubmissions = await getCFSubmissions();
		submissions = [...submissions, ...cfSubmissions];
		const acSubmissions = await getAtCoderSubmissions();
		submissions = [...submissions, ...acSubmissions];
		const ccSubmissions = await getCCSubmissionsFromFile();
		submissions = [...submissions, ...ccSubmissions];

		submissions.sort((a, b) => a.timestamp - b.timestamp);
		fs.writeFileSync('submissions.json', JSON.stringify(submissions));
		console.log("Total length: ", submissions.length);
		console.log("First submission: ", submissions[0]);
		console.log("Last submission: ", submissions[submissions.length - 1]);
	} catch (err) {
		console.log("Err: ", err);
	}
}

// controller();

const generateReadme = async () => {
	const timestampForCM = 1612542900; // Just after the contest in which I became Candidate Master
	const allSubmissions = JSON.parse(fs.readFileSync('submissions.json'));
	const submissions = allSubmissions.filter(submission => submission.timestamp <= timestampForCM);
	let readme = `# Result of this script

Now this is not a fully automated script, but using this I got all my submissions, and here's the list of everything I solved before becoming candidate master on codeforces.

## Total Problems Solved: ${submissions.length}

| Name | My Submission | Platform |
|------|---------------|----------|
`;

	for (const submission of submissions) {
		const submissionId = submission.submissionUrl.split('/').pop();
		readme += `| [${submission.problemName}](${submission.problemUrl}) | [${submissionId}](${submission.submissionUrl}) | ${submission.platform} |
`;
	}
	fs.writeFileSync('README.md', readme);
}

generateReadme();