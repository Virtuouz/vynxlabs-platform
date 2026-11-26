# p35-rt-node-cp: a script could become root in its container

Found by the red team of [phase 35](../../phases/phase-35-stress-and-red-team.md), lane 11 (execution isolation), and confirmed on the built image before it was fixed.

## The hole (critical)

The image carries `node-cp`, a copy of node with the capabilities to switch users (`cap_setuid,cap_setgid+ep`), so that the control plane can start each managed worker as a user of its own. The file was mode 0755: anyone in the container could run it. A tenant's script had only to start `/usr/local/bin/node-cp` by its path and call `setuid(0)`.

- With managed workers on a user of their own (`MANAGED_WORKER_USER=own`), the script then read the control plane's environment: the database's address, `MASTER_KEY`, `AUTH_SECRET`.
- In a worker host's container it reached the other tenants' worker directories and the host's token.
- With `MANAGED_WORKER_USER=same` nothing was added: a script already runs as the control plane's user there, as `SECURITY.md` says.

Proof before the fix, on the image: as uid 10001, `node-cp -e 'process.setgid(0);process.setuid(0);console.log(process.getuid())'` printed `0`.

## The fix

`Dockerfile`: `node-cp` is owned `root:node` with mode 0750, and its owner and mode are set before its capabilities (a change of owner removes them). The control plane runs as `node` and still starts on it. A worker runs as `vxrun` (10001, or the next users in a worker host), which is not in that group.

Proof after, on the image built from the change:

- from a shell as uid 10001: `/usr/local/bin/node-cp: Permission denied`, exit 126;
- the control plane's user starts `node-cp`, starts a process as uid 10001 with gid 10001 (its groups are `10001` alone), and that process's attempt to run `node-cp` ends with `EACCES`.

`docker run --user 10001 --entrypoint /usr/local/bin/node-cp` still runs it: the container runtime starts an entrypoint the operator names without that check. A script cannot name an entrypoint.

Test: `apps/control-plane/src/image-node-cp.test.ts` holds the Dockerfile to the owner, the mode, their order, and one `setcap` in all.

## Left

- A container started as a user other than `node` cannot run `node-cp`; `volvel-start` then runs the control plane on plain node, which starts no managed worker for a tenant whose code is written outside the operator. That is the behaviour it already had where the capabilities are dropped.
- An instance already deployed is fixed by deploying an image built from this change.
