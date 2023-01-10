module.exports = async (context, req) => {
    const action = req.body.action
    const owner = req.body.repository.owner.login
    const repo = req.body.repository.name
    const sender = req.body.sender.login

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

    const isAllowed = async (login) => {
        const getCollaboratorPermissions = require('./get-collaborator-permissions')
        const token = await getToken()
        const permission = await getCollaboratorPermissions(context, token, owner, repo, login)
        return ['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission.toString())
    }

    if (!isAllowed(sender)) {
        if (action !== 'completed') {
            // Cancel workflow run
            const { cancelWorkflowRun } = require('./check-runs')
            const token = await getToken()
            const workflowRunId = req.body.workflow_job.run_id
            await cancelWorkflowRun(context, token, owner, repo, workflowRunId)
        }
        throw new Error(`${sender} is not allowed to do that`)
    }

    return `Unhandled action: ${action}`
}