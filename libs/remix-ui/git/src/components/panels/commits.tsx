import { checkout, ReadCommitResult } from "isomorphic-git";
import React from "react";
import { gitActionsContext } from "../../state/context";
import GitUIButton from "../buttons/gituibutton";
import { gitPluginContext } from "../gitui";
import LoaderIndicator from "../navigation/loaderindicator";
import { BranchDifferences } from "./branches/branchdifferences";
import { CommitDetails } from "./commits/commitdetails";
import { CommitSummary } from "./commits/commitsummary";

export const Commits = () => {
  const [hasNextPage, setHasNextPage] = React.useState(true)
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)

  const checkout = async (oid: string) => {
    try {
      //await ModalRef.current?.show();
      actions.checkout({ ref: oid })
      //Utils.log("yes");
    } catch (e) {
      //Utils.log("no");
    }
  };

  const loadNextPage = () => {
    //actions.fetch(null, context.currentBranch.name, null, 5, true, true)
    actions.fetch({
      remote: null,
      ref: context.currentBranch,
      relative: true,
      depth: 5,
      singleBranch: true
    })
    //actions.getBranchCommits(branch, lastPageNumber+1)
  }

  const getRemote = () => {
    return context.upstream ? context.upstream : context.defaultRemote ? context.defaultRemote : null
  }

  const getCommitChanges = async (commit: ReadCommitResult) => {
    await actions.getCommitChanges(commit.oid, commit.commit.parent[0],null, getRemote())
  }

  const fetchIsDisabled = () => {
    return (!context.upstream)|| context.remotes.length === 0
  }

  return (
    <>
      {context.commits && context.commits.length ?
        <><BranchDifferences branch={context.currentBranch}></BranchDifferences><div>
          <div className="pt-1">
            {context.commits && context.commits.map((commit, index) => {
              return (
                <CommitDetails branch={context.currentBranch} getCommitChanges={getCommitChanges} key={index} checkout={checkout} commit={commit}></CommitDetails>
              );
            })}
          </div>
        </div>
        {hasNextPage && <GitUIButton disabledCondition={fetchIsDisabled()} className="mb-1 ml-2 btn btn-sm" onClick={loadNextPage}>Load more</GitUIButton>}
        </>
        : <div className="text-muted">No commits</div>}
    </>
  )
}