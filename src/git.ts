import simpleGit from 'simple-git'
const git = simpleGit()
import { fileEndings } from './consts.js'

export async function isGitRepo() {
  try {
    await git.revparse(['--is-inside-work-tree'])
    return true
  } catch (error) {
    return false
  }
}

export async function getRepoFiles() {
  const files = await git.raw(['ls-files'])
  return files.split('\n').filter(file => fileEndings.some(ending => file.endsWith(ending)))
}

export async function checkOutBranch(branchName: string) {
    await git.checkoutLocalBranch(branchName)

}