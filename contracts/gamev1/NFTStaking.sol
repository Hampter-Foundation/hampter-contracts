// SPDX-License-Identifier: MIT

// https://playhampter.com/
//                                       =@@.        @@+
//                                     .@-             -@
//                                    *@                 %@
//                                   @@                    @.
//                                  @                       @
//                              @@@@                        *@
//                             @@@@@                         @@@.
//                             @@@@@                         -@@@#
//                            @@@@@@                         +@@@@@
//                           +@@:@@+                          -@@= @
//                          .@@@@@%                                 @#
//                         #@ @@@+                                   @#
//                        #@                                          @#
//                       #@                                            #@
//                      @+                                               @.
//                     :@                     .......=-                   @-
//                     @                    @@:......@:                    @+
//                   .@                       @@.....@                      @-
//                  :@                          @@..=@                       @
//                 @*                             +**                         @
//                @                                                            @
//              :@                                                              @*
//             .@                        @@#@@@@@@@@@@@@@@@@-                    @*
//             @                                                                  @+
//            @                                                                    @
//           @                                                                     :@
//          @=                                                                      +@
//         @*                                                                        @
//        :@                                                                         -@
//        @+                                                                          @#
//       -@                                                                            @-
//       @                                                                              @
//      @:                                                                              :@
//      @                                                                                @*
//     %@                                                                                 @
//    +@                            @.                         _=@@:                      =@
//    @                               @-                      @@                           @
//   +@                         :%:    @#                    @.   #@.                      #@
//   @                            `@@  @%                     `*@`                          @
//  @*                              `-:`                                                    @
//  @                                                                                       @
//  @                                                                                       @
// :@                                                                                       @
// @                                                                                        @
// ██████╗ ██╗      █████╗ ██╗   ██╗██╗  ██╗ █████╗ ███╗   ███╗██████╗ ████████╗███████╗██████╗
// ██╔══██╗██║     ██╔══██╗╚██╗ ██╔╝██║  ██║██╔══██╗████╗ ████║██╔══██╗╚══██╔══╝██╔════╝██╔══██╗
// ██████╔╝██║     ███████║ ╚████╔╝ ███████║███████║██╔████╔██║██████╔╝   ██║   █████╗  ██████╔╝
// ██╔═══╝ ██║     ██╔══██║  ╚██╔╝  ██╔══██║██╔══██║██║╚██╔╝██║██╔═══╝    ██║   ██╔══╝  ██╔══██╗
// ██║     ███████╗██║  ██║   ██║   ██║  ██║██║  ██║██║ ╚═╝ ██║██║        ██║   ███████╗██║  ██║
// ╚═╝     ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝        ╚═╝   ╚══════╝╚═╝  ╚═╝
// https://playhampter.com/

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract NFTStaking is ERC721Holder, Ownable, ReentrancyGuard {
    struct StakedNFT {
        address collection;
        uint256 tokenId;
        address owner;
        uint256 timestamp;
    }

    mapping(address => mapping(uint256 => StakedNFT)) public stakedNFTs;
    mapping(address => StakedNFT[]) public userStakedTokens;
    mapping(address => bool) public allowedCollections;

    event NFTStaked(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed owner
    );
    event NFTUnstaked(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed owner
    );
    event CollectionAdded(address indexed collection);
    event CollectionRemoved(address indexed collection);

    constructor() Ownable(msg.sender) {}

    function addCollection(address _collection) external onlyOwner {
        require(!allowedCollections[_collection], "Collection already added");
        allowedCollections[_collection] = true;
        emit CollectionAdded(_collection);
    }

    function removeCollection(address _collection) external onlyOwner {
        require(allowedCollections[_collection], "Collection not allowed");
        allowedCollections[_collection] = false;
        emit CollectionRemoved(_collection);
    }

    function stakeNFT(
        address _collection,
        uint256 _tokenId
    ) external nonReentrant {
        require(allowedCollections[_collection], "Collection not allowed");
        require(
            stakedNFTs[_collection][_tokenId].owner == address(0),
            "NFT already staked"
        );

        IERC721(_collection).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId
        );

        StakedNFT memory newStakedNFT = StakedNFT({
            collection: _collection,
            tokenId: _tokenId,
            owner: msg.sender,
            timestamp: block.timestamp
        });

        stakedNFTs[_collection][_tokenId] = newStakedNFT;
        userStakedTokens[msg.sender].push(newStakedNFT);

        emit NFTStaked(_collection, _tokenId, msg.sender);
    }

    function unstakeNFT(
        address _collection,
        uint256 _tokenId
    ) external nonReentrant {
        StakedNFT storage stakedNFT = stakedNFTs[_collection][_tokenId];
        require(
            stakedNFT.owner == msg.sender,
            "Not the owner of this staked NFT"
        );

        IERC721(_collection).safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId
        );

        // Remove the token from userStakedTokens
        StakedNFT[] storage userNFTs = userStakedTokens[msg.sender];
        for (uint256 i = 0; i < userNFTs.length; i++) {
            if (
                userNFTs[i].collection == _collection &&
                userNFTs[i].tokenId == _tokenId
            ) {
                userNFTs[i] = userNFTs[userNFTs.length - 1];
                userNFTs.pop();
                break;
            }
        }

        delete stakedNFTs[_collection][_tokenId];

        emit NFTUnstaked(_collection, _tokenId, msg.sender);
    }

    function getStakedNFTOwner(
        address _collection,
        uint256 _tokenId
    ) external view returns (address) {
        return stakedNFTs[_collection][_tokenId].owner;
    }

    function getUserStakedNFTs(
        address _user
    ) external view returns (StakedNFT[] memory) {
        return userStakedTokens[_user];
    }

    function getUserStakedNFTsForCollection(
        address _user,
        address _collection
    ) external view returns (StakedNFT[] memory) {
        StakedNFT[] memory allUserNFTs = userStakedTokens[_user];
        uint256 count = 0;

        // First, count how many NFTs the user has staked from this collection
        for (uint256 i = 0; i < allUserNFTs.length; i++) {
            if (allUserNFTs[i].collection == _collection) {
                count++;
            }
        }

        // Create an array of the correct size
        StakedNFT[] memory userNFTs = new StakedNFT[](count);

        // Fill the array with the user's staked NFTs from this collection
        uint256 index = 0;
        for (uint256 i = 0; i < allUserNFTs.length; i++) {
            if (allUserNFTs[i].collection == _collection) {
                userNFTs[index] = allUserNFTs[i];
                index++;
            }
        }

        return userNFTs;
    }
}
