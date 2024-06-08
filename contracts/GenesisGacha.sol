// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Genesis Gacha Ticket Contract
/// @notice This contract allows users to mint and burn Genesis Gacha Tickets.
/// @dev Inherits ERC721A for efficient batch minting and Ownable for access control.
contract GenesisGacha is ERC721A, Ownable {

    /// @notice Constructor to initialize the Genesis Gacha Ticket contract.
    constructor() ERC721A("Genesis GachaTicket", "GenesisHampterGacha") Ownable(msg.sender){}

    /// @notice Mint new Genesis Gacha Tickets.
    /// @dev Mints `quantity` tickets to the caller's address.
    /// @param quantity The number of tickets to mint.
    /// @return The ID of the first minted ticket.
    function mint(uint256 quantity) public onlyOwner returns (uint256) {
        require(quantity > 0, "Quantity must be greater than 0");
        _mint(msg.sender, quantity);
    }

    /// @notice Burn a Genesis Gacha Ticket.
    /// @dev Only the owner or an approved address can burn the ticket.
    /// @param tokenId The ID of the ticket to burn.
    function burn(uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "ERC721A: caller is not owner nor approved");
        _burn(tokenId);
    }

    /// @notice Check if `spender` is allowed to manage `tokenId`.
    /// @dev Internal function to validate ownership or approval.
    /// @param spender The address attempting to manage the ticket.
    /// @param tokenId The ID of the ticket being managed.
    /// @return True if `spender` is the owner or an approved manager, false otherwise.
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner || getApproved(tokenId) == spender || isApprovedForAll(owner, spender));
    }
}