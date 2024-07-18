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

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "erc721a/contracts/ERC721A.sol";
// import "@limitbreak/creator-token-contracts/contracts/erc721c/ERC721AC.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract HampterNFT is Ownable, ERC721A, ReentrancyGuard {
    uint256 public immutable maxPerAddressDuringMint;
    uint256 public immutable amountForDevs;
    uint256 public immutable collectionSize;
    string private _baseTokenURI;

    struct SaleConfig {
        uint32 publicSaleStartTime;
        uint64 mintlistPrice; // Price for AllowList Mint
        uint64 publicPrice;
    }

    SaleConfig public saleConfig;

    mapping(address => uint256) public allowlist;

    constructor(
        uint256 maxBatchSize_,
        uint256 collectionSize_,
        uint256 amountForDevs_
    ) ERC721A("Hampter NFT", "HAMPTER") Ownable(msg.sender) {
        require(maxBatchSize_ > 0, "maxBatchSize must be greater than zero");
        require(
            collectionSize_ > 0,
            "collection size must be greater than zero"
        );
        require(
            amountForDevs <= collectionSize_,
            "larger collection size needed"
        );

        collectionSize = collectionSize_;
        maxPerAddressDuringMint = maxBatchSize_;
        amountForDevs = amountForDevs_;
    }

    modifier callerIsUser() {
        require(tx.origin == msg.sender, "The caller is another contract");
        _;
    }

    function allowlistMint() external payable callerIsUser {
        uint256 price = uint256(saleConfig.mintlistPrice);
        require(price != 0, "allowlist sale has not begun yet");
        require(allowlist[msg.sender] > 0, "not eligible for allowlist mint");
        require(totalSupply() + 1 <= collectionSize, "reached max supply");
        allowlist[msg.sender]--;
        _safeMint(msg.sender, 1);
        refundIfOver(price);
    }

    /// @dev Mint NFTs for public sale
    /// This will not be used if NFTs are airdropped to users.
    function publicSaleMint(uint256 quantity) external payable callerIsUser {
        SaleConfig memory config = saleConfig;
        uint256 publicPrice = uint256(config.publicPrice);
        uint256 publicSaleStartTime = uint256(config.publicSaleStartTime);

        require(
            isPublicSaleOn(publicPrice, publicSaleStartTime),
            "public sale has not begun yet"
        );
        require(
            totalSupply() + quantity <= collectionSize,
            "reached max supply"
        );
        require(
            numberMinted(msg.sender) + quantity <= maxPerAddressDuringMint,
            "cannot mint more than maxBatchSize"
        );
        _safeMint(msg.sender, quantity);
        refundIfOver(publicPrice * quantity);
    }

    /// @dev Logic to check payment for mint
    function refundIfOver(uint256 price) private {
        require(msg.value >= price, "Need to send more ETH.");
        if (msg.value > price) {
            payable(msg.sender).transfer(msg.value - price);
        }
    }

    function isPublicSaleOn(
        uint256 publicPriceWei,
        uint256 publicSaleStartTime
    ) public view returns (bool) {
        return publicPriceWei != 0 && block.timestamp >= publicSaleStartTime;
    }

    function setSaleInfo(
        uint32 publicSaleStartTime,
        uint64 mintlistPriceWei,
        uint64 publicPriceWei
    ) external onlyOwner {
        saleConfig = SaleConfig(
            publicSaleStartTime,
            mintlistPriceWei,
            publicPriceWei
        );
    }

    /// @dev Set Addresses for allow list
    function seedAllowlist(
        address[] memory addresses,
        uint256[] memory numSlots
    ) external onlyOwner {
        require(
            addresses.length == numSlots.length,
            "addresses does not match numSlots length"
        );
        for (uint256 i = 0; i < addresses.length; i++) {
            allowlist[addresses[i]] = numSlots[i];
        }
    }

    // For marketing etc.
    function devMint(uint256 quantity) external onlyOwner {
        require(
            quantity % maxPerAddressDuringMint == 0,
            "can only mint a multiple of the maxBatchSize"
        );
        uint256 numChunks = quantity / maxPerAddressDuringMint;
        for (uint256 i = 0; i < numChunks; i++) {
            _safeMint(msg.sender, maxPerAddressDuringMint);
        }
    }

    /// @dev For marketing et
    function mint(address recipient, uint256 quantity) external onlyOwner {
        require(
            totalSupply() + quantity <= collectionSize,
            "Would exceed max supply"
        );

        _mint(recipient, quantity);
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    function setBaseURI(string calldata baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function withdrawMoney() external onlyOwner nonReentrant {
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "Transfer failed.");
    }

    function numberMinted(address owner) public view returns (uint256) {
        return _numberMinted(owner);
    }
}
