#!/usr/bin/env node

import inquirer from 'inquirer'

import { config } from 'dotenv'
import { encode } from 'gpt-3-encoder'
import { promises as fs } from 'fs'
import ora from 'ora'
import { Configuration, OpenAIApi } from 'openai'
import { getConfigs } from './config.js'
import { cutFileContent, extractRequestedFiles, getFunctionName, parseCodeSuggestions } from './parsers.js'
import { checkOutBranch, getRepoFiles, isGitRepo } from './git.js'
import { applyCodeSuggestions } from './fs.js'
import {
  initialSystemInstruction,
  instructionPrompt,
  featurePrompt,
  fileListPrompt,
  getSuggestionsPrompt
} from './prompts.js'
import { calculateTokens } from './tokens.js'

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

  //prompt the user in a checkbox list to select the files they want to send to GPT-3 from the list of requested files

  const { selectedFiles } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedFiles',
      message: 'GPT has requested the following files. Select the ones you deem relevant.',
      choices: requestedFiles.map(file => ({
        name: file,
        value: file
      }))
    }
  ])

  for (const file of selectedFiles) {
    const fileContent = fileContents.find(({ path }) => path === file)?.content

    //ora spinner to show the user that the file is being cut
    const cutSpinner = ora(`Analyzing ${file}`).start()
    const fileContentCut = await cutFileContent(apiKey, fileContent as string)
    cutSpinner.stop()

    //present the user with the relevant cut blocks and ask them to select the ones they want to send
    const { selectedBlocks } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedBlocks',
        message: `Select relevant blocks from ${file}`,
        choices: fileContentCut.map((block, index) => ({
          name: getFunctionName(block),
          value: index
        }))
      }
    ])

    //add the selected blocks to the history
    for (const selectedBlock of selectedBlocks) {
      history.push({
        role: 'user',
        content: 'code block from ' + file + ':\n' + fileContentCut[selectedBlock]
      })
    }

    //if the user doesn't want to cut, we just send the entire file content to GPT
  }

  //at this point remove the file list entry from the history as it is no longer needed
  history = history.filter(entry => !entry.content.includes('The repository contains the following files'))

  const codeSuggestionsPrompt = getSuggestionsPrompt(content, languages)

  //add the code suggestions prompt to the history
  history.push({
    role: 'user',
    content: codeSuggestionsPrompt
  })

  const getSuggestionsSpinner = ora('Generating code suggestions...').start()
  const codeSuggestionsText = await chatGptRequest(apiKey, history)
  getSuggestionsSpinner.stop()

  try {
    const codeSuggestions = parseCodeSuggestions(codeSuggestionsText.response)

    //save the entire conversation to the log variable

    log = history.map(entry => entry.content).join('\n')
    log += '\n\n' + codeSuggestionsText.response

    //also add a line showing which files were requested
    log += `\n\nRequested files: ${requestedFiles.join(', ')}`
    //save log to disk
    await fs.writeFile('log.txt', log, 'utf-8')
    return codeSuggestions
  } catch (e) {
    console.error('Error: GPT return a code suggestion respopnse that could not be parsed.')
    console.log('GPT response:')
    console.log(codeSuggestionsText.response)
    process.exit(1)
  }
}

// Updated chatGptRequest function
export async function chatGptRequest(apiKey: string, history: { role: string; content: string }[]) {
  const configuration = new Configuration({ apiKey })
  const openai = new OpenAIApi(configuration)

  console.log('Tokens used by this request: ' + encode(history.map(entry => entry.content).join('\n')).length)

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

  if (!apiKey) {
    console.error('Error: OPENAI_KEY not set.')
    process.exit(1)
  }

  const repoFiles = await getRepoFiles()
  //const codeSuggestionSpinner = ora('Generating code suggestions...').start()
  const codeSuggestions = await generateBranchCode(
    repoFiles,
    apiKey,
    content,
    languages,
    specialInstructions,
    tokenLimit
  )
  //codeSuggestionSpinner.succeed('Code suggestions generated.')

  const { confirmed, branchName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'branchName',
      message: `Code suggestions are ready. I suggest we check out the branch name "${suggestedBranchName}". 
      Press Enter to accept or type a new name:`,
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
  const applyCodeSuggestionsSpinner = ora('Applying code suggestions...').start()

  try {
    await applyCodeSuggestions(codeSuggestions)
  } catch (e) {
    applyCodeSuggestionsSpinner.fail('Code suggestions could not be applied.')
    console.error('This usually happens if chatGPT fails to return a properly formatted response. Please try again.')
    console.error('here is the code suggestions response in RAW format:')
    console.error(codeSuggestions)
    process.exit(1)
  }

  console.log('Branch setup complete. Happy coding!')
  ora('You can view the full conversation log in the log.txt file.').start()

  process.exit(0)
}

main()
