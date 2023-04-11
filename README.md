# BranchCraft
BranchCraft is an interactive CLI tool that streamlines branch creation and code suggestions for Git repositories. Powered by OpenAI's GPT, it enhances your development workflow by seamlessly generating new branches with relevant code snippets.
With BranchCraft, you can quickly create new branches containing relevant code snippets, making it easier to jumpstart your development process.


## using GPT 3.5 turbo
Branchcraft natively uses GPT 3.5 turbo. This means that you need a premium OpenAI account to use BranchCraft. If you don't have a premium account, you can sign up for one [here](https://beta.openai.com/signup). Support for the free model is coming soon.



A note on BranchCraft's current state: BranchCraft is currently in beta. It is not yet ready for production use. We are actively working on improving the tool and adding new features. If you have any feedback or suggestions, please feel free to contribute.

For large code bases or repos, you may encounter issues with max token length. Smartly handling large code bases is a high priority, but there's a fine line to be walked in trimming context and preserving necessary context. We're working on it! If you do encounter an error, try adding special instructions to limit the potential scope of what files BranchCraft will look at. For example, if you're working on a React app, you can add the following special instructions to the CLI: "you should only ask me for .tsx files in the /src/pages/home directory". This will limit the scope of the search and hopefully prevent the error from occurring.





```bash

## Installation
To install BranchCraft globally and use it in your own Git repositories, run the following command:

```
npm install -g branchcraft
```

### Configuration

The first time you use branchcraft, you will need to configure your OpenAI API key. You will be prompted for the key by the Cli.
Your API key can be found in your OpenAI account settings.

The key is stored by branchraft in your home directory in a file called `.branchcraft`. If you need to change your key, you can do so by editing this file.


### Creating a new branch

To create a new branch using BranchCraft, navigate to your Git repository and run the following command:

```
branchcraft
```

The CLI will prompt you for information about the new branch, such as the type of content it should include, the programming languages the code should be written in, and any special instructions for GPT. Once you provide the necessary information, BranchCraft will generate code suggestions and apply them to the new branch.


### Workflow example:
Here's an example of how you might use BranchCraft in your workflow:

First, install BranchCraft globally by running the following command in your terminal:

```
npm install -g branchcraft
```

Configure your OpenAI API key. When you run BranchCraft for the first time, it will prompt you for the key. You can find the key in your OpenAI account settings. The key will be stored in a .branchcraft file in your home directory.

Now, navigate to your existing Git repository:

```
cd /path/to/your/repository
```
Run the BranchCraft CLI tool:

```bash
branchcraft
```

The CLI will guide you through a series of prompts. 
Based on your input, BranchCraft will use GPT to generate relevant code suggestions for the new branch.

BranchCraft creates the new branch and applies the generated code suggestions
You can now review the generated code, make any necessary adjustments, and continue working on the new feature.
