import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from '@octokit/rest';
const context = github.context;
import { parseConfig, template } from "./lib/util";
import _ from "lodash";
import Minimatch from "minimatch";

async function run() {
  try {
    const token = core.getInput("token", { required: true });
    const configPath = core.getInput("config");
    const octokit = new github.GitHub(token);

    const configContent = await fetchContent(octokit, configPath);

    if (!configContent) {
      core.error(`invalid config path: ${configPath}`);
    }

    const config = parseConfig(configContent);

    core.debug("config");
    core.debug(JSON.stringify(config));


    const { data: pullRequest } = await octokit.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
    });

    const addComment = config.addComment || false;
    const changedFiles = await getChangedFiles(octokit, pullRequest.number);
    const author = pullRequest.user.login;

    var reviewers = new Set<string>();

    if (!config.matches) {
      core.debug("no match rules provided");
      return;
    }

    _.each(_.keys(config.matches), (globPattern) => {
      if (hasGlobPatternMatchedFile(changedFiles, globPattern)) {
        let newReviewers = _.pull(config.matches[globPattern], author);
        for (const reviewer of newReviewers) {
          reviewers.add(reviewer);
        }
      }
    });

    core.debug("assigning reviewers");
    const reviewerList = Array.from(reviewers);
    await assignReviewers(octokit, reviewerList).catch((error) => {
      core.setFailed(error.message);
    });

    if (addComment && reviewerList.length > 0) {
      const users = reviewerList.map((reviewer) => `@${reviewer}`).join(", ");
      core.debug("add comment");
      const commentTemplate = config.template ?? ':wave: ${reviewers} have been assigned to review this pull request.';
      core.debug(`comment template: ${commentTemplate}`);
      try {
        const comment = template(commentTemplate, { reviewers: users });
        await addReviewComment(octokit, comment);
      } catch (error) {
        core.setFailed(error.message);
      }
    }

    core.info("finished!");
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function fetchContent(client: Octokit, repoPath: string) {
  const response = await client.repos.getContents({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: repoPath,
    ref: github.context.sha,
  }).catch(() => null);

  if (!response) {
    return null;
  }

  const data = !Array.isArray(response.data) ? response.data : null;

  if (!data) {
    return null;
  }

  return Buffer.from(data.content, data.encoding as BufferEncoding).toString();
}

async function getChangedFiles(client: Octokit, prNumber: number) {
  const listFilesResponse = [];
  let page = 1;
  let response;
  
  do {
    response = await client.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
      per_page: 100,
      page
    });

    listFilesResponse.push(...response.data);
    page += 1;
  } while (response.data.length)

  const changedFiles = listFilesResponse.map((f) => f.filename);

  core.debug("found changed files:");
  for (const file of changedFiles) {
    core.debug("  " + file);
  }

  return changedFiles;
}

function hasGlobPatternMatchedFile(changedFiles: string[], globPattern: string) {
  for (const changedFile of changedFiles) {
    if (Minimatch(changedFile, globPattern, { dot: true })) {
      core.info("  " + changedFile + " matches " + globPattern);
      return true;
    }
  }

  return false;
}

async function addReviewComment(octokit: Octokit, comment: string) {
    await octokit.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: comment,
      issue_number: context.payload.pull_request.number,
    });
}

async function assignReviewers(octokit: Octokit, reviewers: string[]) {
    await octokit.pulls.createReviewRequest({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
      reviewers: reviewers,
      team_reviewers: reviewers,
    });
}

run();
