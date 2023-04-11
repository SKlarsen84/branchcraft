#!/usr/bin/env node

import inquirer from 'inquirer'

import { config } from 'dotenv'
import { promises as fs } from 'fs'
import ora from 'ora'
import { Configuration, OpenAIApi } from 'openai'
import { getConfigs } from './config.js'
import { extractRequestedFiles, parseCodeSuggestions } from './parsers.js'
import { checkOutBranch, getRepoFiles, isGitRepo } from './git.js'
import { applyCodeSuggestions } from './fs.js'
import {
  initialSystemInstruction,
  instructionPrompt,
  featurePrompt,
  fileListPrompt,
  fileContentPrompt,
  getSuggestionsPrompt
} from './prompts.js'

config()

// Initialize the history array
let history: { role: string; content: string }[] = []
let log = ''

async function generateBranchCode(
  files: string[],
  apiKey: string,
  content: string,
  languages: string,
  specialInstructions: string,
  _tokenLimit: number
) {
  const fileContentsPromises = files.map(async file => {
    const content = await fs.readFile(file, 'utf-8')
    return { path: file, content }
  })

  const fileContents = await Promise.all(fileContentsPromises)
  const fileList = files.map(path => `- ${path}`).join('\n')

  history.push({
    role: 'system',
    content: initialSystemInstruction
  })

  //add any special instructions to the history
  if (specialInstructions) {
    history.push({
      role: 'user',
      content: instructionPrompt(specialInstructions)
    })
  }

  //add the list of files to the history
  history.push({
    role: 'user',
    content: featurePrompt(content)
  })

  //add the list of files to the history
  history.push({
    role: 'user',
    content: fileListPrompt(fileList)
  })

  const gptDesiredFiles = (await chatGptRequest(apiKey, history)).response

  //extract the requested files from the GPT-3 response
  const requestedFiles = extractRequestedFiles(gptDesiredFiles)

  for (const requestedFile of requestedFiles) {
    const fileContent = fileContents.find(({ path }) => path === requestedFile)?.content

    //cut the file content to the first 1000 characters to avoid hitting the API limit
    const fileContentCut = fileContent?.slice(0, 1000)

    const prompt = fileContentPrompt(requestedFile, fileContentCut || 'file not found')
    //simply add the file content to the history
    history.push({
      role: 'user',
      content: prompt
    })
  }

  //at this point remove the file list entry from the history as it is no longer needed
  history = history.filter(entry => !entry.content.includes('The repository contains the following files'))

  const codeSuggestionsPrompt = getSuggestionsPrompt(content, languages)

  //add the code suggestions prompt to the history
  history.push({
    role: 'user',
    content: codeSuggestionsPrompt
  })

  const codeSuggestionsText = await chatGptRequest(apiKey, history)

  const codeSuggestions = parseCodeSuggestions(codeSuggestionsText.response)

  //save the entire conversation to the log variable

  log = history.map(entry => entry.content).join('\n')
  log += '\n\n' + codeSuggestionsText.response

  //also add a line showing which files were requested
  log += `\n\nRequested files: ${requestedFiles.join(', ')}`
  //save log to disk
  await fs.writeFile('log.txt', log, 'utf-8')
  return codeSuggestions
}

// Updated chatGptRequest function
async function chatGptRequest(apiKey: string, history: { role: string; content: string }[]) {
  const configuration = new Configuration({ apiKey })
  const openai = new OpenAIApi(configuration)

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: history as any,

    temperature: 0.5
  })

  const text = ((response.data.choices[0].message as any).content as string).trim()

  // Replace double backslashes with single backslashes and remove extra quotes
  return { response: text.replace(/\\/g, '\\').replace(/^"|"$/g, '') }
}

// Updated main function
async function main() {
  const welcomeSpinner = ora('This is BranchCraft!').start()
  await new Promise(resolve => setTimeout(resolve, 1000))
  welcomeSpinner.stop()

  if (!(await isGitRepo())) {
    console.error('Error: The current directory is not a Git repository.')
    process.exit(1)
  }

  // Update the getApiKey function call in main()
  const { apiKey, tokenLimit } = await getConfigs()
  const { content } = await inquirer.prompt([
    {
      type: 'input',
      name: 'content',
      message: 'What kind of content do you want your new branch to include?'
    }
  ])

  const { languages } = await inquirer.prompt([
    {
      type: 'input',
      name: 'languages',
      message: 'In what language(s) should the code be written? (comma separated)'
    }
  ])

  const { specialInstructions } = await inquirer.prompt([
    {
      type: 'input',
      name: 'specialInstructions',
      message:
        'Is there anything special you want GPT to know before generating the code suggestions? (Leave blank if not)'
    }
  ])

  const suggestedBranchName = `feature/${content.replace(/\s+/g, '-').toLowerCase()}`

  const { confirmed, branchName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'branchName',
      message: `Suggested branch name is "${suggestedBranchName}". Press Enter to accept or type a new name:`,
      default: suggestedBranchName
    },
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Do you want to create this new branch?',
      default: true
    }
  ])

  if (!confirmed) {
    console.log('Branch creation cancelled.')
    process.exit(0)
  }

  const branchCreationSpinner = ora(`Creating branch "${branchName}"...`).start()
  await checkOutBranch(branchName)
  branchCreationSpinner.succeed(`Branch "${branchName}" created.`)

  if (!apiKey) {
    console.error('Error: OPENAI_KEY not set.')
    process.exit(1)
  }

  const repoFiles = await getRepoFiles()
  const codeSuggestionSpinner = ora('Generating code suggestions...').start()
  const codeSuggestions = await generateBranchCode(
    repoFiles,
    apiKey,
    content,
    languages,
    specialInstructions,
    tokenLimit
  )
  codeSuggestionSpinner.succeed('Code suggestions generated.')

  const applyCodeSuggestionsSpinner = ora('Applying code suggestions...').start()

  try {
    await applyCodeSuggestions(codeSuggestions)
  } catch (e) {
    applyCodeSuggestionsSpinner.fail('Code suggestions could not be applied.')
    console.error('This usually happens if chatGPT fails to return a properly formatted response. Please try again.')
    process.exit(1)
  }

  console.log('Branch setup complete. Happy coding!')
  ora('You can view the full conversation log in the log.txt file.').start()
  process.exit(0)
}

main()
