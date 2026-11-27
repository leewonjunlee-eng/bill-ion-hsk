// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Append-only registry for attestations made by the deployment's evidence writer.
/// @dev A record proves publication by the writer. It does not validate an HSP order or a transfer.
contract SettlementEvidenceRegistry {
    error ZeroWriter();
    error UnauthorizedWriter();
    error EmptyEvidence();
    error RevisionAlreadyRecorded();
    error TransferAlreadyRecorded();

    address public immutable writer;
    mapping(bytes32 revision => bytes32 proof) public proofOf;
    mapping(bytes32 transferKey => bytes32 revision) public revisionOfTransfer;

    event EvidenceRecorded(bytes32 indexed revision, bytes32 indexed transferKey, bytes32 proof);

    constructor(address evidenceWriter) {
        if (evidenceWriter == address(0)) revert ZeroWriter();
        writer = evidenceWriter;
    }

    function record(bytes32 revision, bytes32 transferKey, bytes32 proof) external {
        if (msg.sender != writer) revert UnauthorizedWriter();
        if (revision == bytes32(0) || transferKey == bytes32(0) || proof == bytes32(0)) revert EmptyEvidence();
        if (proofOf[revision] != bytes32(0)) revert RevisionAlreadyRecorded();
        if (revisionOfTransfer[transferKey] != bytes32(0)) revert TransferAlreadyRecorded();

        proofOf[revision] = proof;
        revisionOfTransfer[transferKey] = revision;
        emit EvidenceRecorded(revision, transferKey, proof);
    }
}
