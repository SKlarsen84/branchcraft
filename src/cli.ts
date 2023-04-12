#!/usr/bin/env node

import inquirer from 'inquirer'

import { config } from 'dotenv'
import { encode } from 'gpt-3-encoder'
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
  console.log(`GPT requested the following files: 
  
  ${requestedFiles.join('\n ')}`)

  for (const requestedFile of requestedFiles) {
    const fileContent = fileContents.find(({ path }) => path === requestedFile)?.content

    const { cut } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'cut',
        default: true,
        message: `Branchcraft has asked for the file ${requestedFile}. Branchcraft will cut it into smaller blocks and you will be given the option to send those chunks you deem relevant.`
      }
    ])

    if (cut) {
      //if the user wants to cut, we need to send the file content to GPT-3 and query it for the individual function blocks.
      const fileContentCut = await cutFileContent(apiKey, fileContent as string)

      //present the user with the relevant cut blocks and ask them to select the ones they want to send
      const { selectedBlocks } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedBlocks',
          message: `Selected relevant blocks from ${requestedFile}`,
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
          content: 'code block from ' + requestedFile + ':\n' + fileContentCut[selectedBlock]
        })
      }
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

const cutFileContent = async (apiKey: string, fileContent: string) => {
  //send the file content to GPT-3 and query it for the individual function blocks.
  const { response } = await chatGptRequest(apiKey, [
    {
      role: 'system',
      content:
        'You are a code block extractor. The user sends you code or markdown in a string and you return each function or section you identify as a separate code block.'
    },
    {
      role: 'user',
      content:
        'I will now send you a file. Please use your best judgment to split it into meaningful chunks. If it is code, return each function as a block. If it is markdown, return each section as a code block.'
    },
    { role: 'assistant', content: 'OK' },
    { role: 'user', content: fileContent }
  ])

  //parse the response into an array of code blocks
  const codeBlocks = parseCodeBlocks(response) as string[]
  return codeBlocks
}

const parseCodeBlocks = (response: string) => {
  //every code block is encapsulated by three backticks - we use a regex to find all of them

  const codeBlockRegex = /```[\s\S]*?```/g
  const codeBlocks = response.match(codeBlockRegex)

  //if no code blocks were found, return an empty array
  if (!codeBlocks) {
    return []
  }

  //remove the three backticks from the start and end of each code block - also remove the first line of each code block
  let blocks = codeBlocks.map(block => block.slice(3, -3)).map(block => block.split('\n').slice(1).join('\n'))

  return blocks
}

//function to try and find the function name via regex - if it fails, return the first line of the function
const getFunctionName = (codeBlock: string) => {
  //regex to find line up until the first opening parenthesis
  const functionNameRegex = /.*?(?=\()/g
  const functionName = codeBlock.match(functionNameRegex)

  //if the regex failed, return the first line of the function
  if (!functionName) {
    return codeBlock.split('\n')[0]
  }

  //if there's an equal sign in the function name, it's an arrow function. Clean it up.
  if (functionName[0].includes('=')) {
    return functionName[0].split('=')[0].trim()
  }

  return functionName[0]
}
