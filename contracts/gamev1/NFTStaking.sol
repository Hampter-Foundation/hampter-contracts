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
    mapping(address => uint256[]) public userStakedTokens;
    mapping(address => bool) public allowedCollections;

    event NFTStaked(address indexed collection, uint256 indexed tokenId, address indexed owner);
    event NFTUnstaked(address indexed collection, uint256 indexed tokenId, address indexed owner);
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

    function stakeNFT(address _collection, uint256 _tokenId) external nonReentrant {
        require(allowedCollections[_collection], "Collection not allowed");
        require(stakedNFTs[_collection][_tokenId].owner == address(0), "NFT already staked");

        IERC721(_collection).safeTransferFrom(msg.sender, address(this), _tokenId);

        stakedNFTs[_collection][_tokenId] = StakedNFT({
            collection: _collection,
            tokenId: _tokenId,
            owner: msg.sender,
            timestamp: block.timestamp
        });

        userStakedTokens[msg.sender].push(_tokenId);

        emit NFTStaked(_collection, _tokenId, msg.sender);
    }

    function unstakeNFT(address _collection, uint256 _tokenId) external nonReentrant {
        StakedNFT storage stakedNFT = stakedNFTs[_collection][_tokenId];
        require(stakedNFT.owner == msg.sender, "Not the owner of this staked NFT");

        IERC721(_collection).safeTransferFrom(address(this), msg.sender, _tokenId);

        // Remove the token from userStakedTokens
        for (uint256 i = 0; i < userStakedTokens[msg.sender].length; i++) {
            if (userStakedTokens[msg.sender][i] == _tokenId) {
                userStakedTokens[msg.sender][i] = userStakedTokens[msg.sender][userStakedTokens[msg.sender].length - 1];
                userStakedTokens[msg.sender].pop();
                break;
            }
        }

        delete stakedNFTs[_collection][_tokenId];

        emit NFTUnstaked(_collection, _tokenId, msg.sender);
    }

    function getStakedNFTOwner(address _collection, uint256 _tokenId) external view returns (address) {
        return stakedNFTs[_collection][_tokenId].owner;
    }

    function getUserStakedNFTs(address _user) external view returns (StakedNFT[] memory) {
        uint256[] memory tokenIds = userStakedTokens[_user];
        StakedNFT[] memory userNFTs = new StakedNFT[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            address collection = stakedNFTs[stakedNFTs[address(0)][tokenId].collection][tokenId].collection;
            userNFTs[i] = stakedNFTs[collection][tokenId];
        }

        return userNFTs;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}