module.exports = async (context, req) => {
    const command = req.body.comment.body
    const owner = req.body.repository.owner.login
    const repo = req.body.repository.name
    const issueNumber = req.body.issue.number
    const commenter = req.body.comment.user.login
    const commentId = req.body.comment.id

    if (command === '/hi') {
        const comment = `Hi @${commenter}!`

        const getInstallationAccessToken = require('./get-installation-access-token')
        const token = await getInstallationAccessToken(context, req.body.installation.id)

        const { addIssueComment } = require('./issues')
        await addIssueComment(context, token, owner, repo, issueNumber, comment)

        return 'I said hi!'
    }

    const getToken = (() => {
        let token

        const get = async () => {
            const getInstallationIdForRepo = require('./get-installation-id-for-repo')
            const installationId = await getInstallationIdForRepo(context, owner, repo)
            const getInstallationAccessToken = require('./get-installation-access-token')
            return await getInstallationAccessToken(context, installationId)
        }

        return async () => token || (token = await get())
    })()

    const checkPermissions = async () => {
        const getCollaboratorPermissions = require('./get-collaborator-permissions')
        const token = await getToken()
        const permission = await getCollaboratorPermissions(context, token, owner, repo, commenter)
        if (!['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission.toString())) throw new Error(`@${commenter} has no permissions to do that`)
    }

    try {
        if (command == '/open pr') {
            await checkPermissions()

            let [ , package_name, version ] = req.body.issue.title.match(/^\[New (\S+) version\] (\S+)/) || []
            if (package_name == 'git-lfs') package_name = `mingw-w64-${package_name}`
            if (version.startsWith('v')) version = version.substring(1)
            if (!package_name || !version) throw new Error(`Could not parse ${req.issue.title}`)

            const { createReactionForIssueComment } = require('./issues')
            await createReactionForIssueComment(console, await getToken(), owner, repo, commentId, '+1')

            const triggerWorkflowDispatch = require('./trigger-workflow-dispatch')
            const answer = await triggerWorkflowDispatch(
                context,
                await getToken(),
                'git-for-windows',
                'git-for-windows-automation',
                'open-pr.yml',
                'main', {
                    package: package_name,
                    version
                }
            )
            const { appendToIssueComment } = require('./issues')
            await appendToIssueComment(context, await getToken(), owner, repo, commentId, `The workflow run [was started](${answer.html_url})`)
        }
    } catch (e) {
        const { createReactionForIssueComment } = require('./issues')
        await createReactionForIssueComment(console, await getToken(), owner, repo, commentId, 'confused')
        throw e
    }
}