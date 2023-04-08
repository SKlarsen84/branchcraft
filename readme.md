# BranchCraft

BranchCraft is an interactive CLI tool that streamlines branch creation and code suggestions for Git repositories. Powered by OpenAI's GPT-4, it enhances your development workflow by seamlessly generating new branches with relevant code snippets.

## Installation

To install BranchCraft globally and use it in your own Git repositories, run the following command:

```bash
npm install -g branchcraft
```

## Usage

### Configuration

The first time you use branchcraft, you will need to configure your OpenAI API key. You will be prompted for the key by the Cli.
Your API key can be found in your OpenAI account settings.

The key is stored by branchraft in your home directory in a file called `.branchcraft`. If you need to change your key, you can do so by editing this file.


### Creating a new branch

To create a new branch using BranchCraft, navigate to your Git repository and run the following command:

```bash
branchcraft creaste
```

The CLI will prompt you for information about the new branch, such as the type of content it should include, the programming languages the code should be written in, and any special instructions for GPT. Once you provide the necessary information, BranchCraft will generate code suggestions and apply them to the new branch.
