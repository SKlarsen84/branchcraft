#!/usr/bin/env node

import inquirer from 'inquirer'
import simpleGit from 'simple-git'
import { config } from 'dotenv'
import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import * as readline from 'readline'
import ora from 'ora'
import { Configuration, OpenAIApi } from 'openai'
config()

const git = simpleGit()

async function isGitRepo() {
  try {
    await git.revparse(['--is-inside-work-tree'])
    return true
  } catch (error) {
    return false
  }
}

async function getRepoFiles() {
  const files = await git.raw(['ls-files'])
  return files.split('\n').filter(file => file.endsWith('.js') || file.endsWith('.ts'))
}

async function generateBranchCode(
  files: string[],
  apiKey: string,
  content: string,
  languages: string,
  specialInstructions: string,
  tokenLimit: number
) {
  const fileContentsPromises = files.map(async file => {
    const content = await fs.readFile(file, 'utf-8')
    return { path: file, content }
  })

  const fileContents = await Promise.all(fileContentsPromises)

  const fileList = files.map(path => `- ${path}`).join('\n')

  const initialPrompt = `The user wants to create a new branch that introduces the following feature: "${content}". The current repository has the following existing files:

  ${fileList}

  Return ONLY a comma separated list of file names that seem like they may be pertinent to this new branch. Do not write any other text in your response.
  `

  // Initialize the history array
  const history: { role: string; content: string }[] = []

  //set the instructory prompt telling the GPT what role it is playing

  history.push({
    role: 'system',
    content:
      'You are a helpful AI that will assist the user in providing code suggestions for their project based on their request.'
  })

  //add any special instructions to the history
  if (specialInstructions) {
    history.push({
      role: 'user',
      content: 'here are special instructions to consider when fulfilling your work: ' + specialInstructions
    })
  }

  const fileRequest = await chatGptRequest(initialPrompt, apiKey, history, tokenLimit)
  const requestedFiles = extractRequestedFiles(fileRequest)
  const sendingFilesPrompt = `I am now sending you the content of the requested files. Please inspect them. 
    I will let you know when I am done sending the file contents.`

  await chatGptRequest(sendingFilesPrompt, apiKey, history, tokenLimit)
  for (const requestedFile of requestedFiles.filter(f => f !== 'src/cli.ts')) {
    const fileContent = fileContents.find(({ path }) => path === requestedFile)?.content
    const prompt = `File transmission start
      
      File name: ${requestedFile}
      File content:
      ${fileContent}
      
      File transmission end. Please reply OK.`

    console.log(`Sending file content for ${requestedFile}`)
    await chatGptRequest(prompt, apiKey, history, tokenLimit)
  }

  console.log('All file contents sent. Awaiting code suggestions.')

  const codeSuggestionsPrompt = `You have received all the requested file contents. Please provide the code suggestions for adding functionality described here:

  ${content}

  The code should be written in the following language(s): ${languages}.

  The format of your reply must be this:

  [
  {
  "filePath": "./file.ext",
  "fileContent": "file content here"
  },
  ...
  ]

  I need this answer as a JSON string. Make sure it is valid JSON.
  Don't answer with markdown. Don't answer with any sentences such as "Here are the code suggestions"

  Your reply should start with a square bracket and end with a square bracket. Nothing else.
  `

  const codeSuggestionsText = await chatGptRequest(codeSuggestionsPrompt, apiKey, history, tokenLimit)

  const codeSuggestions = parseCodeSuggestions(codeSuggestionsText)

  return codeSuggestions
}

// Updated chatGptRequest function
async function chatGptRequest(
  prompt: string,
  apiKey: string,
  history: { role: string; content: string }[],
  tokenLimit: number
) {
  // Add the user's message to the history array
  history.push({
    role: 'user',
    content: prompt
  })

  // Trim the conversation within the token limit before sending it to the API
  const trimmedHistory = trimConversationWithinTokenLimit(history, tokenLimit - 1)

  const configuration = new Configuration({ apiKey })
  const openai = new OpenAIApi(configuration)

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: trimmedHistory as any,
    temperature: 0.2
  })

  const text = ((response.data.choices[0].message as any).content as string).trim()

  // Add the AI's response to the history array
  history.push({
    role: 'assistant',
    content: text
  })

  // Save the entire chat history to a file in the user's home directory with the date and time as the file name
  const historyPath = `log.branchcraft.latest.txt`
  await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8')

  // Replace double backslashes with single backslashes and remove extra quotes
  return text.replace(/\\/g, '\\').replace(/^"|"$/g, '')
}
function extractRequestedFiles(text: string) {
  const files = text.split(',').map(file => file.trim())

  return files
}

async function main() {
  const welcomeSpinner = ora('Welcome to Create This Branch!').start()
  await new Promise(resolve => setTimeout(resolve, 1000))
  welcomeSpinner.stop()

  if (!(await isGitRepo())) {
    console.error('Error: The current directory is not a Git repository.')
    process.exit(1)
  }

  // Update the getApiKey function call in main()
  const { apiKey, tokenLimit } = await getApiKey()
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
  await git.checkoutLocalBranch(branchName)
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
  await applyCodeSuggestions(codeSuggestions)
  applyCodeSuggestionsSpinner.succeed('Code suggestions applied.')

  console.log('Branch setup complete. Happy coding!')
}
async function applyCodeSuggestions(suggestions: any) {
  // Iterate through the suggestions and apply them to the corresponding files
  for (const fileSuggestion of suggestions) {
    const { filePath, fileContent } = fileSuggestion

    if (fileContent) {
      // Ensure the directory exists before writing the file
      const dirPath = path.dirname(filePath)
      await fs.mkdir(dirPath, { recursive: true })

      console.log(`Writing file ${filePath}`)
      await fs.writeFile(filePath, fileContent, 'utf-8')
    } else {
      console.error(`Error: No file content received for ${filePath}`)
    }
  }
}

async function getApiKey(): Promise<{ apiKey: string; tokenLimit: number }> {
  const configPath = path.join(os.homedir(), '.branchcraft')
  let apiKey: string
  let tokenLimit = 2048

  try {
    const configContent = (await fs.readFile(configPath, 'utf-8')).trim()
    const configLines = configContent.split('\n')
    apiKey = configLines.find(line => line.startsWith('OPENAI_KEY='))?.replace('OPENAI_KEY=', '') as string
    tokenLimit = Number(configLines.find(line => line.startsWith('TOKEN_LIMIT='))?.replace('TOKEN_LIMIT=', ''))
  } catch (err) {
    console.log('No API key found. Please enter your OpenAI API key:')
    apiKey = await readLine()
    await saveApiKey(configPath, apiKey)
  }

  if (!apiKey) {
    console.log('API key not set. Please enter your OpenAI API key:')
    apiKey = await readLine()
    await saveApiKey(configPath, apiKey)
  }

  const { premiumSubscription } = await inquirer.prompt([
    {
      type: 'input',
      name: 'premiumSubscription',
      message:
        'Do you have a premium OpenAI subscription? (Affects the number of tokens you can use per request.) [yes/no]',
      default: 'yes'
    }
  ])

  tokenLimit = premiumSubscription === 'yes' ? 4096 : 2048
  await saveTokenLimit(configPath, tokenLimit)

  // Return both apiKey and tokenLimit
  return { apiKey, tokenLimit }
}

async function saveApiKey(configPath: string, apiKey: string) {
  const currentContent = await fs.readFile(configPath, 'utf-8').catch(() => '')
  await fs.writeFile(configPath, `OPENAI_KEY=${apiKey}\n${currentContent}`, 'utf-8')
  console.log('API key saved successfully.')
}

async function saveTokenLimit(configPath: string, tokenLimit: number) {
  const currentContent = await fs.readFile(configPath, 'utf-8').catch(() => '')
  await fs.writeFile(configPath, `TOKEN_LIMIT=${tokenLimit}\n${currentContent}`, 'utf-8')
  console.log('Token limit saved successfully.')
}

function readLine(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise(resolve => {
    rl.question('', answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function parseCodeSuggestions(text: string) {
  let jsonText = text

  //if the text contains 3 backticks, then it seems chatGPT is returning a code block with the code suggestions - we may need to parse it differently

  if (text.includes('```')) {
    jsonText = extractJSONString(text) as string

    if (!jsonText) {
      console.error('Failed to extract JSON string from the response.')
      return null
    }
  }

  // Custom function to safely parse JSON string
  const safelyParseJSON = (jsonString: string): any => {
    try {
      const parsed = JSON.parse(jsonString)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch (e) {
      console.error('Error parsing JSON:', e)
    }
    return null
  }

  // Parse the response
  const codeSuggestions = safelyParseJSON(jsonText)
  if (!codeSuggestions) {
    console.error('Failed to parse code suggestions.')
  }

  return codeSuggestions
}

function extractJSONString(text: string): string | null {
  //find content between triple backticks
  const regex = /```([\s\S]*?)```/gm
  const matches = regex.exec(text)
  if (matches && matches.length > 1) {
    return matches[1]
  }
  return null // no match
}

function calculateTokens(text: string) {
  return Math.ceil(text.length / 3.5)
}

function trimConversationWithinTokenLimit(conversation: { role: string; content: string }[], tokenLimit: number) {
  let currentTokens = 0

  // Calculate the total tokens in the conversation
  for (const msg of conversation) {
    currentTokens += calculateTokens(msg.content)
  }

  // If the conversation is already within the token limit, return it as is
  if (currentTokens <= tokenLimit) {
    return conversation
  }

  // Always include the user's initial content prompt.
  const initialPrompt = conversation.find(msg => msg.role === 'user')
  if (initialPrompt) {
    currentTokens = calculateTokens(initialPrompt.content)
  }

  // Remove messages from the conversation until it fits within the token limit
  const trimmedConversation = initialPrompt ? [initialPrompt] : []
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msg = conversation[i]
    const msgTokens = calculateTokens(msg.content)

    if (currentTokens + msgTokens <= tokenLimit) {
      currentTokens += msgTokens
      trimmedConversation.unshift(msg)
    } else {
      // Check if removing the message will bring the conversation within the token limit
      const potentialTokens = currentTokens - msgTokens
      if (potentialTokens <= tokenLimit) {
        // If removing the message brings the conversation within the token limit, remove it
        currentTokens = potentialTokens
      }
    }
  }

  return trimmedConversation
}

main()
