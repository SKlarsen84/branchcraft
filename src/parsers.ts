import { chatGptRequest } from './cli.js'
import { calculateTokens } from './tokens.js'

export function parseCodeSuggestions(text: string) {
  let jsonText = text

  console.log('Parsing code suggestions from raw :', text)

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
    console.log('Response from GPT was:', jsonText)
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

export function extractRequestedFiles(text: string) {
  const files = text.split(',').map(file => file.trim())

  return files
}

export const parseCodeBlocks = (response: string) => {
  //every code block is encapsulated by three backticks - we use a regex to find all of them

  const codeBlockRegex = /```[\s\S]*?```/g
  const codeBlocks = response.match(codeBlockRegex)

  //if no code blocks were found, return an empty array
  if (!codeBlocks) {
    console.error('No code blocks found.')
    return []
  }

  //remove the three backticks from the start and end of each code block - also remove the first line of each code block
  let blocks = codeBlocks.map(block => block.slice(3, -3)).map(block => block.split('\n').slice(1).join('\n'))

  return blocks
}

//function to try and find the function name via regex - if it fails, return the first line of the function
export const getFunctionName = (codeBlock: string) => {
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

export const cutFileContent = async (apiKey: string, fileContent: string) => {
  //send the file content to GPT-3 and query it for the individual function blocks.
  const { response } = await chatGptRequest(apiKey, [
    {
      role: 'system',
      content:
        'You are a code block extractor. The user sends you code or markdown in a string and you return each function or section you identify as a separate code block.'
    },
    {
      role: 'user',
      content: `I will now send you a file. 
        Split it into meaningful chunks.
        If it is code, return each function as a block.
        If it is markdown, return each section as a code block.
        Reply only with the code blocks.`
    },
    { role: 'assistant', content: 'OK' },
    { role: 'user', content: fileContent }
  ])

  //parse the response into an array of code blocks
  const codeBlocks = parseCodeBlocks(response) as string[]
  return codeBlocks
}
